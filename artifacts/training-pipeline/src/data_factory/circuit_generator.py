"""Circuit generator: synthesise training data via the Photonics-Equilibrium API.

Workflow
--------
1. Generate a random circuit topology using :mod:`.topology_templates`.
2. POST the circuit as a new build to the API server.
3. Trigger a simulation via POST ``/api/builds/:id/simulate``.
4. Collect the simulation results as a training example.
5. DELETE the temporary build to keep the database clean.
6. Write all examples to a JSONL file.

CLI usage::

    python -m src.data_factory.circuit_generator \\
        --api-url http://localhost:3000 \\
        --num-examples 1000 \\
        --output data/training.jsonl \\
        --seed 42
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import random
import sys
import time
from pathlib import Path
from typing import Any

import requests

from .topology_templates import generate_random_circuit

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Core functions
# ---------------------------------------------------------------------------


def simulate_circuit(
    api_url: str,
    circuit: dict[str, Any],
    target_wavelength: float = 1550.0,
    timeout: float = 30.0,
) -> dict[str, Any] | None:
    """Create a temporary build, run a simulation, and return the training example.

    The build is deleted after the simulation completes (or on error) so that
    the API database is not polluted with synthetic data.

    Parameters
    ----------
    api_url:
        Base URL of the Photonics-Equilibrium API (e.g. ``http://localhost:3000``).
    circuit:
        Circuit dictionary as returned by a topology generator.
    target_wavelength:
        Target wavelength in nm for the simulation.
    timeout:
        HTTP request timeout in seconds.

    Returns
    -------
    dict or None
        A training example dictionary with keys ``graph``, ``simulation``,
        ``metadata``, or *None* if the simulation failed.
    """
    builds_url = f"{api_url.rstrip('/')}/api/builds"
    build_id: int | None = None

    try:
        # 1. Create the build
        build_payload = {
            "name": f"synthetic_{circuit['topology']}_{int(time.time())}",
            "description": "Auto-generated for ML training data",
            "targetWavelength": target_wavelength,
            "layout": {
                "components": circuit["components"],
                "connections": circuit["connections"],
            },
        }
        resp = requests.post(builds_url, json=build_payload, timeout=timeout)
        resp.raise_for_status()
        build = resp.json()
        build_id = build["id"]

        # 2. Run simulation
        sim_url = f"{builds_url}/{build_id}/simulate"
        sim_resp = requests.post(sim_url, timeout=timeout)
        sim_resp.raise_for_status()
        sim_result = sim_resp.json()

        # 3. Assemble training example
        example: dict[str, Any] = {
            "graph": {
                "components": circuit["components"],
                "connections": circuit["connections"],
            },
            "simulation": {
                "totalInputPower": sim_result.get("totalInputPower"),
                "totalOutputPower": sim_result.get("totalOutputPower"),
                "systemLoss": sim_result.get("systemLoss"),
                "snr": sim_result.get("snr"),
                "coherenceLength": sim_result.get("coherenceLength"),
                "wavelength": sim_result.get("wavelength"),
                "equilibriumScore": sim_result.get("equilibriumScore"),
                "converged": sim_result.get("converged"),
                "componentResults": sim_result.get("componentResults"),
            },
            "metadata": {
                "topology": circuit["topology"],
                "componentCount": len(circuit["components"]),
                "source": "synthetic",
                "targetWavelength": target_wavelength,
                "timestamp": time.time(),
            },
        }
        return example

    except requests.RequestException as exc:
        logger.warning("Simulation request failed: %s", exc)
        return None
    finally:
        # 4. Always clean up the temporary build
        if build_id is not None:
            try:
                requests.delete(f"{builds_url}/{build_id}", timeout=timeout)
            except requests.RequestException:
                logger.debug("Failed to delete temporary build %s", build_id)


def generate_dataset(
    api_url: str,
    num_examples: int,
    output_path: str | Path,
    seed: int | None = None,
    target_wavelength_range: tuple[float, float] = (1260.0, 1640.0),
) -> int:
    """Generate *num_examples* training examples and write them as JSONL.

    Parameters
    ----------
    api_url:
        Base URL of the Photonics-Equilibrium API.
    num_examples:
        Number of examples to generate.
    output_path:
        Destination file path for the JSONL output.
    seed:
        Optional random seed for reproducibility.
    target_wavelength_range:
        ``(min_nm, max_nm)`` range from which to sample target wavelengths.

    Returns
    -------
    int
        Number of examples successfully generated and written.
    """
    if seed is not None:
        random.seed(seed)

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    written = 0
    with open(output_path, "w", encoding="utf-8") as fh:
        for i in range(num_examples):
            circuit = generate_random_circuit()
            wavelength = random.uniform(*target_wavelength_range)

            example = simulate_circuit(api_url, circuit, target_wavelength=wavelength)
            if example is not None:
                fh.write(json.dumps(example) + "\n")
                written += 1

            if (i + 1) % 50 == 0:
                logger.info("Progress: %d / %d (written: %d)", i + 1, num_examples, written)

    logger.info(
        "Dataset generation complete: %d / %d examples written to %s",
        written,
        num_examples,
        output_path,
    )
    return written


# ---------------------------------------------------------------------------
# CLI entry-point
# ---------------------------------------------------------------------------


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Generate synthetic photonic circuit training data via the API.",
    )
    parser.add_argument(
        "--api-url",
        type=str,
        default=os.getenv("PHOTONICS_API_URL", "http://localhost:3000"),
        help="Base URL of the Photonics-Equilibrium API server.",
    )
    parser.add_argument(
        "--num-examples",
        type=int,
        default=1000,
        help="Number of training examples to generate.",
    )
    parser.add_argument(
        "--output",
        type=str,
        default="data/training.jsonl",
        help="Output JSONL file path.",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=None,
        help="Random seed for reproducibility.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    """CLI entry-point for dataset generation."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    args = _parse_args(argv)
    written = generate_dataset(
        api_url=args.api_url,
        num_examples=args.num_examples,
        output_path=args.output,
        seed=args.seed,
    )
    if written == 0:
        logger.error("No examples were generated. Is the API server running at %s?", args.api_url)
        sys.exit(1)


if __name__ == "__main__":
    main()
