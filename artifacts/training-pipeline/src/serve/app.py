"""FastAPI sidecar for cVAE generation inference."""
from __future__ import annotations

import logging
import os
import time
from pathlib import Path
from typing import Optional

import torch
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

app = FastAPI(title="Photonics ML Generation Sidecar", version="0.1.0")

# Global model state
_cvae_model = None
_cvae_version: Optional[str] = None

COMPONENT_TYPES = [
    "laser_source", "waveguide", "beam_splitter", "coupler", "modulator",
    "photodetector", "optical_amplifier", "phase_shifter", "filter",
    "isolator", "circulator", "mzi", "ring_resonator", "grating_coupler", "mirror",
]

PARAM_NAMES = [
    "wavelength", "power", "loss", "splitRatio", "couplingCoeff",
    "length", "neff", "alpha", "gain", "responsivity",
    "phaseShift", "bandwidth", "extinctionRatio", "reflectivity",
]

PARAM_RANGES = {
    "wavelength": (400, 2000), "power": (-40, 30), "loss": (0, 30),
    "splitRatio": (0, 1), "couplingCoeff": (0, 1), "length": (0, 100000),
    "neff": (1.0, 4.0), "alpha": (0, 20), "gain": (0, 40),
    "responsivity": (0, 2), "phaseShift": (0, 6.284), "bandwidth": (0, 1000),
    "extinctionRatio": (0, 40), "reflectivity": (0, 1),
}


class GenerateRequest(BaseModel):
    targetWavelength: float = Field(ge=400, le=2000, default=1550)
    targetPower: float = Field(ge=-40, le=30, default=-3)
    targetSNR: float = Field(ge=0, le=100, default=30)
    maxComponents: int = Field(ge=2, le=50, default=10)
    numCandidates: int = Field(ge=1, le=10, default=5)
    temperature: float = Field(ge=0.1, le=2.0, default=1.0)


class CircuitNode(BaseModel):
    id: str
    type: str
    label: str
    x: float
    y: float
    params: dict


class CircuitEdge(BaseModel):
    id: str
    fromComponentId: str
    fromPort: str
    toComponentId: str
    toPort: str


class GenerateCandidate(BaseModel):
    nodes: list[CircuitNode]
    edges: list[CircuitEdge]
    predictedScore: float
    confidence: float


class GenerateResponse(BaseModel):
    candidates: list[GenerateCandidate]
    latencyMs: float
    modelVersion: Optional[str] = None


def _denormalize_param(name: str, normalized: float) -> float:
    lo, hi = PARAM_RANGES.get(name, (0, 1))
    return normalized * (hi - lo) + lo


def _raw_circuit_to_candidate(raw: dict, idx: int) -> GenerateCandidate:
    """Convert raw cVAE output to a structured candidate."""
    nodes = []
    for i, node_data in enumerate(raw["nodes"]):
        comp_type = COMPONENT_TYPES[node_data["type_idx"]] if node_data["type_idx"] < len(COMPONENT_TYPES) else "waveguide"
        params = {}
        for j, name in enumerate(PARAM_NAMES):
            if j < len(node_data["params"]):
                params[name] = round(_denormalize_param(name, node_data["params"][j]), 4)

        nodes.append(CircuitNode(
            id=f"gen-{idx}-{i}",
            type=comp_type,
            label=f"{comp_type}_{i}",
            x=i * 200.0,
            y=(i % 3) * 150.0,
            params=params,
        ))

    edges = []
    for j, (src, tgt) in enumerate(raw.get("edges", [])):
        if src < len(nodes) and tgt < len(nodes):
            edges.append(CircuitEdge(
                id=f"gen-{idx}-e{j}",
                fromComponentId=nodes[src].id,
                fromPort="out",
                toComponentId=nodes[tgt].id,
                toPort="in",
            ))

    return GenerateCandidate(
        nodes=nodes,
        edges=edges,
        predictedScore=0.0,  # scored by forward surrogate on the Node.js side
        confidence=0.0,
    )


@app.on_event("startup")
async def load_model():
    global _cvae_model, _cvae_version
    model_path = os.environ.get("CVAE_MODEL_PATH")
    if model_path and Path(model_path).exists():
        try:
            from ..models.generative_cvae import PhotonicCircuitCVAE
            _cvae_model = PhotonicCircuitCVAE()
            checkpoint = torch.load(model_path, map_location="cpu", weights_only=False)
            if isinstance(checkpoint, dict) and "model_state_dict" in checkpoint:
                _cvae_model.load_state_dict(checkpoint["model_state_dict"])
                _cvae_version = checkpoint.get("version", "unknown")
            else:
                _cvae_model.load_state_dict(checkpoint)
                _cvae_version = "unknown"
            _cvae_model.eval()
            logger.info(f"cVAE model loaded from {model_path}")
        except Exception as e:
            logger.error(f"Failed to load cVAE: {e}")
            _cvae_model = None


@app.get("/health")
async def health():
    return {"status": "ok", "modelLoaded": _cvae_model is not None, "modelVersion": _cvae_version}


@app.post("/generate", response_model=GenerateResponse)
async def generate(req: GenerateRequest):
    if _cvae_model is None:
        raise HTTPException(503, "cVAE model not loaded. Set CVAE_MODEL_PATH env var.")

    start = time.perf_counter()

    # Normalize condition vector
    condition = torch.tensor([[
        (req.targetWavelength - 400) / 1600,
        (req.targetPower + 40) / 70,
        req.targetSNR / 100,
        req.maxComponents / 50,
    ]], dtype=torch.float32)

    raw_candidates = _cvae_model.generate(
        condition,
        num_samples=req.numCandidates,
        temperature=req.temperature,
    )

    candidates = [_raw_circuit_to_candidate(raw, i) for i, raw in enumerate(raw_candidates)]
    latency_ms = (time.perf_counter() - start) * 1000

    return GenerateResponse(
        candidates=candidates,
        latencyMs=round(latency_ms, 2),
        modelVersion=_cvae_version,
    )


def main():
    port = int(os.environ.get("SIDECAR_PORT", "8100"))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")


if __name__ == "__main__":
    main()
