"""
Training loop, data loading, and evaluation for the photonic circuit surrogate model.

Usage:
    python -m src.training.train_surrogate \
        --data data/training.jsonl \
        --epochs 100 --lr 1e-3 --batch-size 32 \
        --save models/surrogate_v1.pt
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time
from pathlib import Path
from typing import Any, Optional

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.optim import Adam

try:
    from torch_geometric.data import Data
    from torch_geometric.loader import DataLoader
except ImportError as exc:
    raise ImportError(
        "torch_geometric is required. Install via: "
        "pip install torch-geometric"
    ) from exc

# ---------------------------------------------------------------------------
# Constants  (must match model definitions in src.models.surrogate_gnn)
# ---------------------------------------------------------------------------

COMPONENT_TYPES: list[str] = [
    "laser_source",
    "waveguide",
    "beam_splitter",
    "coupler",
    "modulator",
    "photodetector",
    "optical_amplifier",
    "phase_shifter",
    "filter",
    "isolator",
    "circulator",
    "mzi",
    "ring_resonator",
    "grating_coupler",
    "mirror",
]
NUM_TYPES: int = 15

PARAM_NAMES: list[str] = [
    "wavelength",
    "power",
    "loss",
    "splitRatio",
    "couplingCoeff",
    "length",
    "neff",
    "alpha",
    "gain",
    "responsivity",
    "phaseShift",
    "bandwidth",
    "extinctionRatio",
    "reflectivity",
]
NUM_PARAMS: int = 14

PARAM_RANGES: dict[str, tuple[float, float]] = {
    "wavelength": (400, 2000),
    "power": (-40, 30),
    "loss": (0, 30),
    "splitRatio": (0, 1),
    "couplingCoeff": (0, 1),
    "length": (0, 100000),
    "neff": (1.0, 4.0),
    "alpha": (0, 20),
    "gain": (0, 40),
    "responsivity": (0, 2),
    "phaseShift": (0, 6.284),
    "bandwidth": (0, 1000),
    "extinctionRatio": (0, 40),
    "reflectivity": (0, 1),
}

DEFAULT_PARAMS: dict[str, dict[str, float]] = {
    "laser_source": {"wavelength": 1550, "power": 0, "bandwidth": 0.1},
    "waveguide": {"wavelength": 1550, "alpha": 2.0, "length": 1000, "neff": 2.4},
    "beam_splitter": {"wavelength": 1550, "splitRatio": 0.5, "loss": 0.3},
    "coupler": {"wavelength": 1550, "couplingCoeff": 0.5, "loss": 0.5},
    "modulator": {"wavelength": 1550, "extinctionRatio": 20, "loss": 5.0},
    "photodetector": {"wavelength": 1550, "responsivity": 0.8},
    "optical_amplifier": {"wavelength": 1550, "gain": 10, "loss": 1.0},
    "phase_shifter": {"wavelength": 1550, "phaseShift": 3.14159, "loss": 0.5},
    "filter": {"wavelength": 1550, "bandwidth": 100, "loss": 1.0},
    "isolator": {"wavelength": 1550, "loss": 0.5},
    "circulator": {"wavelength": 1550, "loss": 1.0},
    "mzi": {"wavelength": 1550, "phaseShift": 1.5708, "loss": 2.0},
    "ring_resonator": {"wavelength": 1550, "couplingCoeff": 0.1, "loss": 3.0},
    "grating_coupler": {"wavelength": 1550, "loss": 3.0},
    "mirror": {"wavelength": 1550, "reflectivity": 0.99},
}

# Derived look-ups
_TYPE_INDEX: dict[str, int] = {t: i for i, t in enumerate(COMPONENT_TYPES)}
_PARAM_INDEX: dict[str, int] = {p: i for i, p in enumerate(PARAM_NAMES)}

# Node feature width = one-hot type (15) + normalised params (14) = 29
NODE_FEAT_DIM: int = NUM_TYPES + NUM_PARAMS  # 29

# Node-level target: power, snr, phase, status_one_hot (3)  => 6
NODE_TARGET_DIM: int = 6

# Graph-level target: eq_score, system_loss, coherence, converged => 4
GLOBAL_TARGET_DIM: int = 4

# Status mapping for one-hot encoding of node status
_STATUS_MAP: dict[str, int] = {"active": 0, "saturated": 1, "failed": 2}


# ---------------------------------------------------------------------------
# 1. encode_node  ->  list[float] of length 29
# ---------------------------------------------------------------------------

def encode_node(node_dict: dict[str, Any]) -> list[float]:
    """Encode a single node dictionary into a fixed-length feature vector.

    Returns a list of length 29:
      - [0:15]  one-hot component type
      - [15:29] min-max normalised physical parameters with default imputation
    """
    comp_type: str = node_dict.get("type", "waveguide")
    type_idx = _TYPE_INDEX.get(comp_type, _TYPE_INDEX["waveguide"])

    # One-hot encoding for component type
    one_hot = [0.0] * NUM_TYPES
    one_hot[type_idx] = 1.0

    # Retrieve the raw parameter dict (may be nested under "params")
    raw_params: dict[str, Any] = node_dict.get("params", node_dict)

    # Get defaults for this component type
    defaults = DEFAULT_PARAMS.get(comp_type, {})

    normalised: list[float] = []
    for pname in PARAM_NAMES:
        lo, hi = PARAM_RANGES[pname]
        span = hi - lo if hi != lo else 1.0

        # Priority: explicit value > component default > midpoint
        raw_val = raw_params.get(pname)
        if raw_val is None:
            raw_val = defaults.get(pname)
        if raw_val is None:
            raw_val = (lo + hi) / 2.0

        val = float(raw_val)
        # Clamp then normalise to [0, 1]
        val = max(lo, min(hi, val))
        normalised.append((val - lo) / span)

    return one_hot + normalised


# ---------------------------------------------------------------------------
# 2. example_to_pyg  ->  torch_geometric.data.Data | None
# ---------------------------------------------------------------------------

def _encode_status_one_hot(status: str) -> list[float]:
    """Return 3-element one-hot for node status."""
    vec = [0.0, 0.0, 0.0]
    idx = _STATUS_MAP.get(status, 0)
    vec[idx] = 1.0
    return vec


def example_to_pyg(example: dict[str, Any]) -> Optional[Data]:
    """Convert a single training example (dict) to a PyG Data object.

    Returns None if the example has 0 nodes.

    Expected example schema (from data_factory output):
    {
      "nodes": [ {"id": "n0", "type": "laser_source", "params": {...}}, ... ],
      "edges": [ {"source": "n0", "target": "n1"}, ... ],
      "results": {
        "nodes": { "n0": {"power": ..., "snr": ..., "phase": ..., "status": ...}, ... },
        "global": {"eqScore": ..., "systemLoss": ..., "coherence": ..., "converged": ...}
      }
    }
    """
    nodes = example.get("nodes", [])
    if len(nodes) == 0:
        return None

    # Build node-id -> index mapping
    id_to_idx: dict[str, int] = {}
    for i, n in enumerate(nodes):
        nid = n.get("id", f"n{i}")
        id_to_idx[nid] = i

    # --- Node features [N, 29] ---
    x_rows: list[list[float]] = []
    for n in nodes:
        x_rows.append(encode_node(n))

    # --- Edge index [2, E] ---
    edges = example.get("edges", [])
    src_list: list[int] = []
    dst_list: list[int] = []
    for e in edges:
        s = e.get("source", e.get("src"))
        t = e.get("target", e.get("dst"))
        if s in id_to_idx and t in id_to_idx:
            src_list.append(id_to_idx[s])
            dst_list.append(id_to_idx[t])

    # --- Node-level targets [N, 6] ---
    results = example.get("results", {})
    node_results = results.get("nodes", {})
    y_node_rows: list[list[float]] = []
    for n in nodes:
        nid = n.get("id", "")
        nr = node_results.get(nid, {})
        power = float(nr.get("power", 0.0))
        snr = float(nr.get("snr", 0.0))
        phase = float(nr.get("phase", 0.0))
        status = str(nr.get("status", "active"))
        status_oh = _encode_status_one_hot(status)
        y_node_rows.append([power, snr, phase] + status_oh)

    # --- Global targets [1, 4] ---
    g = results.get("global", {})
    eq_score = float(g.get("eqScore", g.get("eq_score", 0.0)))
    system_loss = float(g.get("systemLoss", g.get("system_loss", 0.0)))
    coherence = float(g.get("coherence", 0.0))
    converged_raw = g.get("converged", False)
    converged = 1.0 if converged_raw else 0.0

    # --- Assemble Data ---
    data = Data()
    data.x = torch.tensor(x_rows, dtype=torch.float)
    data.edge_index = (
        torch.tensor([src_list, dst_list], dtype=torch.long)
        if len(src_list) > 0
        else torch.zeros((2, 0), dtype=torch.long)
    )
    data.y_node = torch.tensor(y_node_rows, dtype=torch.float)
    data.y_global = torch.tensor(
        [[eq_score, system_loss, coherence, converged]], dtype=torch.float
    )

    return data


# ---------------------------------------------------------------------------
# 3. load_dataset  ->  list[Data]
# ---------------------------------------------------------------------------

def load_dataset(path: str | Path) -> list[Data]:
    """Read a JSONL file and convert each line to a PyG Data object.

    Lines that fail to parse or produce 0-node graphs are skipped.
    """
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Dataset not found: {path}")

    dataset: list[Data] = []
    skipped = 0
    with open(path, "r", encoding="utf-8") as fh:
        for lineno, line in enumerate(fh, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                example = json.loads(line)
            except json.JSONDecodeError:
                skipped += 1
                continue
            data = example_to_pyg(example)
            if data is not None:
                dataset.append(data)
            else:
                skipped += 1

    print(f"[load_dataset] Loaded {len(dataset)} graphs from {path} "
          f"(skipped {skipped})")
    return dataset


# ---------------------------------------------------------------------------
# 4. train
# ---------------------------------------------------------------------------

def _compute_loss(
    pred_node: torch.Tensor,   # [total_nodes, 6]
    pred_global: torch.Tensor, # [B, 4]
    y_node: torch.Tensor,      # [total_nodes, 6]
    y_global: torch.Tensor,    # [B, 4]
) -> tuple[torch.Tensor, dict[str, float]]:
    """Composite loss: MSE for continuous + CE for status + BCE for converged.

    Node targets layout:  [power, snr, phase, status_oh_0, status_oh_1, status_oh_2]
    Global targets layout: [eq_score, system_loss, coherence, converged]
    """
    # --- Node-level losses ---
    # Continuous: power, snr, phase  (cols 0-2)
    loss_node_cont = F.mse_loss(pred_node[:, :3], y_node[:, :3])

    # Status: cross-entropy over 3 classes  (cols 3-5)
    # pred_node[:, 3:6] are logits; y_node[:, 3:6] are one-hot
    status_target = y_node[:, 3:6].argmax(dim=1)  # [total_nodes]
    loss_node_status = F.cross_entropy(pred_node[:, 3:6], status_target)

    # --- Global-level losses ---
    # Continuous: eq_score, system_loss, coherence  (cols 0-2)
    loss_global_cont = F.mse_loss(pred_global[:, :3], y_global[:, :3])

    # Converged: BCEWithLogits  (col 3)
    loss_converged = F.binary_cross_entropy_with_logits(
        pred_global[:, 3], y_global[:, 3]
    )

    # Weighted sum
    total = loss_node_cont + loss_node_status + loss_global_cont + loss_converged

    metrics = {
        "node_mse": loss_node_cont.item(),
        "node_ce": loss_node_status.item(),
        "global_mse": loss_global_cont.item(),
        "bce_converged": loss_converged.item(),
        "total": total.item(),
    }
    return total, metrics


def train(
    data_path: str | Path,
    epochs: int = 100,
    lr: float = 1e-3,
    batch_size: int = 32,
    save_path: str | Path = "models/surrogate_v1.pt",
    hidden_dim: int = 64,
    num_layers: int = 4,
    device: str | None = None,
) -> float:
    """Full training loop for the surrogate GNN model.

    Parameters
    ----------
    data_path : path to JSONL training data
    epochs : number of training epochs
    lr : learning rate for Adam
    batch_size : mini-batch size for DataLoader
    save_path : where to save the best model checkpoint
    hidden_dim : hidden dimension for the GNN  (passed to model constructor)
    num_layers : number of message-passing layers  (passed to model constructor)
    device : 'cpu', 'cuda', or None (auto-detect)

    Returns
    -------
    float : best validation loss achieved
    """
    # ---- Device ----
    if device is None:
        device = "cuda" if torch.cuda.is_available() else "cpu"
    dev = torch.device(device)
    print(f"[train] Using device: {dev}")

    # ---- Data ----
    dataset = load_dataset(data_path)
    if len(dataset) == 0:
        raise ValueError("Dataset is empty after loading. Check your JSONL file.")

    # 90/10 split (deterministic)
    n_val = max(1, int(len(dataset) * 0.1))
    n_train = len(dataset) - n_val

    generator = torch.Generator().manual_seed(42)
    train_set, val_set = torch.utils.data.random_split(
        dataset, [n_train, n_val], generator=generator
    )
    print(f"[train] Train: {n_train}  |  Val: {n_val}")

    train_loader = DataLoader(
        list(train_set), batch_size=batch_size, shuffle=True
    )
    val_loader = DataLoader(list(val_set), batch_size=batch_size, shuffle=False)

    # ---- Model ----
    # Try importing the model from the expected location (Task 9b)
    try:
        from src.models.surrogate_gnn import PhotonicSurrogateGNN
    except ImportError:
        # Fallback: build a minimal GNN inline so training can proceed
        # even if the model file hasn't been created yet.
        print(
            "[train] WARNING: Could not import PhotonicSurrogateGNN from "
            "src.models.surrogate_gnn. Using built-in fallback model."
        )
        PhotonicSurrogateGNN = _FallbackSurrogateGNN  # noqa: N806

    model = PhotonicSurrogateGNN(
        node_feat_dim=NODE_FEAT_DIM,
        hidden_dim=hidden_dim,
        num_layers=num_layers,
        node_target_dim=NODE_TARGET_DIM,
        global_target_dim=GLOBAL_TARGET_DIM,
    )
    model = model.to(dev)
    total_params = sum(p.numel() for p in model.parameters())
    print(f"[train] Model parameters: {total_params:,}")

    optimizer = Adam(model.parameters(), lr=lr)

    # ---- Training loop ----
    best_val_loss = float("inf")
    save_path = Path(save_path)
    save_path.parent.mkdir(parents=True, exist_ok=True)

    for epoch in range(1, epochs + 1):
        t0 = time.time()

        # -- Train --
        model.train()
        train_metrics_accum: dict[str, float] = {}
        train_batches = 0
        for batch in train_loader:
            batch = batch.to(dev)
            optimizer.zero_grad()

            pred_node, pred_global = model(
                batch.x, batch.edge_index, batch.batch
            )

            # Gather per-graph global targets into [B, 4]
            y_global = batch.y_global  # already [B, 4] after batching
            loss, metrics = _compute_loss(
                pred_node, pred_global, batch.y_node, y_global
            )

            loss.backward()
            # Gradient clipping for stability
            nn.utils.clip_grad_norm_(model.parameters(), max_norm=5.0)
            optimizer.step()

            for k, v in metrics.items():
                train_metrics_accum[k] = train_metrics_accum.get(k, 0.0) + v
            train_batches += 1

        # Average train metrics
        train_avg = {
            k: v / max(train_batches, 1)
            for k, v in train_metrics_accum.items()
        }

        # -- Validate --
        model.eval()
        val_metrics_accum: dict[str, float] = {}
        val_batches = 0
        with torch.no_grad():
            for batch in val_loader:
                batch = batch.to(dev)
                pred_node, pred_global = model(
                    batch.x, batch.edge_index, batch.batch
                )
                y_global = batch.y_global
                _, metrics = _compute_loss(
                    pred_node, pred_global, batch.y_node, y_global
                )
                for k, v in metrics.items():
                    val_metrics_accum[k] = val_metrics_accum.get(k, 0.0) + v
                val_batches += 1

        val_avg = {
            k: v / max(val_batches, 1) for k, v in val_metrics_accum.items()
        }

        elapsed = time.time() - t0

        # -- Checkpoint --
        improved = ""
        if val_avg["total"] < best_val_loss:
            best_val_loss = val_avg["total"]
            torch.save(
                {
                    "epoch": epoch,
                    "model_state_dict": model.state_dict(),
                    "optimizer_state_dict": optimizer.state_dict(),
                    "val_loss": best_val_loss,
                    "config": {
                        "node_feat_dim": NODE_FEAT_DIM,
                        "hidden_dim": hidden_dim,
                        "num_layers": num_layers,
                        "node_target_dim": NODE_TARGET_DIM,
                        "global_target_dim": GLOBAL_TARGET_DIM,
                    },
                },
                save_path,
            )
            improved = "  *best*"

        # -- Print --
        print(
            f"Epoch {epoch:3d}/{epochs} "
            f"| train_loss {train_avg['total']:.4f} "
            f"(mse={train_avg['node_mse']:.4f} "
            f"ce={train_avg['node_ce']:.4f} "
            f"g_mse={train_avg['global_mse']:.4f} "
            f"bce={train_avg['bce_converged']:.4f}) "
            f"| val_loss {val_avg['total']:.4f} "
            f"| {elapsed:.1f}s{improved}"
        )

    print(f"\n[train] Best val loss: {best_val_loss:.6f}")
    print(f"[train] Model saved to: {save_path}")
    return best_val_loss


# ---------------------------------------------------------------------------
# Fallback minimal GNN (used only when src.models.surrogate_gnn is absent)
# ---------------------------------------------------------------------------

class _FallbackSurrogateGNN(nn.Module):
    """Minimal GNN surrogate so training can run without the Task-9b model."""

    def __init__(
        self,
        node_feat_dim: int = 29,
        hidden_dim: int = 64,
        num_layers: int = 4,
        node_target_dim: int = 6,
        global_target_dim: int = 4,
    ):
        super().__init__()
        try:
            from torch_geometric.nn import GCNConv, global_mean_pool
        except ImportError as exc:
            raise ImportError("torch_geometric is required") from exc

        self.encoder = nn.Linear(node_feat_dim, hidden_dim)
        self.convs = nn.ModuleList()
        for _ in range(num_layers):
            self.convs.append(GCNConv(hidden_dim, hidden_dim))
        self.node_head = nn.Linear(hidden_dim, node_target_dim)
        self.global_head = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, global_target_dim),
        )
        self._pool = None  # lazy import in forward

    def forward(
        self,
        x: torch.Tensor,
        edge_index: torch.Tensor,
        batch: torch.Tensor,
    ) -> tuple[torch.Tensor, torch.Tensor]:
        from torch_geometric.nn import global_mean_pool

        h = F.relu(self.encoder(x))
        for conv in self.convs:
            h = F.relu(conv(h, edge_index))

        # Node predictions
        pred_node = self.node_head(h)

        # Graph-level predictions
        graph_emb = global_mean_pool(h, batch)
        pred_global = self.global_head(graph_emb)

        return pred_node, pred_global


# ---------------------------------------------------------------------------
# 5. CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Train photonic circuit surrogate GNN model."
    )
    parser.add_argument(
        "--data",
        type=str,
        required=True,
        help="Path to JSONL training data (e.g. data/training.jsonl)",
    )
    parser.add_argument(
        "--epochs",
        type=int,
        default=100,
        help="Number of training epochs (default: 100)",
    )
    parser.add_argument(
        "--lr",
        type=float,
        default=1e-3,
        help="Learning rate (default: 1e-3)",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=32,
        help="Mini-batch size (default: 32)",
    )
    parser.add_argument(
        "--save",
        type=str,
        default="models/surrogate_v1.pt",
        help="Path to save best model checkpoint",
    )
    parser.add_argument(
        "--hidden-dim",
        type=int,
        default=64,
        help="Hidden dimension for GNN layers (default: 64)",
    )
    parser.add_argument(
        "--num-layers",
        type=int,
        default=4,
        help="Number of GNN message-passing layers (default: 4)",
    )
    parser.add_argument(
        "--device",
        type=str,
        default=None,
        help="Device: cpu, cuda, or auto-detect (default: auto)",
    )

    args = parser.parse_args()

    best_val = train(
        data_path=args.data,
        epochs=args.epochs,
        lr=args.lr,
        batch_size=args.batch_size,
        save_path=args.save,
        hidden_dim=args.hidden_dim,
        num_layers=args.num_layers,
        device=args.device,
    )

    sys.exit(0 if math.isfinite(best_val) else 1)


if __name__ == "__main__":
    main()
