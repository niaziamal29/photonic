"""
Training loop for the Conditional VAE photonic circuit generator (inverse design).

Usage:
    python -m src.training.train_generative \
        --data data/training.jsonl \
        --epochs 200 \
        --save models/cvae_v1.pt
"""

from __future__ import annotations

import argparse
import json
import math
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
        "torch_geometric is required. Install via: pip install torch-geometric"
    ) from exc

from src.models.generative_cvae import (
    PhotonicCircuitCVAE,
    NUM_COMPONENT_TYPES,
    NUM_PARAMS,
    NODE_FEATURE_DIM,
    LATENT_DIM,
    CONDITION_DIM,
    MAX_NODES,
)
from src.training.train_surrogate import (
    COMPONENT_TYPES,
    PARAM_NAMES,
    PARAM_RANGES,
    DEFAULT_PARAMS,
    encode_node,
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_TYPE_INDEX: dict[str, int] = {t: i for i, t in enumerate(COMPONENT_TYPES)}


# ---------------------------------------------------------------------------
# 1. Data loading -- convert JSONL examples into CVAE training batches
# ---------------------------------------------------------------------------

def _extract_condition(example: dict[str, Any]) -> list[float]:
    """Extract the 4-dim condition vector from an example.

    Condition = [wavelength_norm, power_norm, snr_norm, max_components_norm]

    We normalise each to roughly [0, 1] using the known parameter ranges.
    """
    nodes = example.get("nodes", [])
    results = example.get("results", {})
    node_results = results.get("nodes", {})

    # Wavelength: take the median across nodes (already in nm; normalise to [0, 1])
    wavelengths = []
    for n in nodes:
        params = n.get("params", n)
        w = params.get("wavelength")
        if w is not None:
            wavelengths.append(float(w))
    wl_lo, wl_hi = PARAM_RANGES["wavelength"]
    if wavelengths:
        wl = sorted(wavelengths)[len(wavelengths) // 2]
    else:
        wl = 1550.0
    wl_norm = (wl - wl_lo) / (wl_hi - wl_lo)

    # Power: take the max output power across nodes
    powers = []
    for nr in node_results.values():
        p = nr.get("power")
        if p is not None:
            powers.append(float(p))
    p_lo, p_hi = PARAM_RANGES["power"]
    pwr = max(powers) if powers else 0.0
    pwr_norm = (pwr - p_lo) / (p_hi - p_lo)

    # SNR: take the max across nodes
    snrs = []
    for nr in node_results.values():
        s = nr.get("snr")
        if s is not None:
            snrs.append(float(s))
    snr_val = max(snrs) if snrs else 0.0
    # SNR can be large; clip to 100 and normalise
    snr_norm = min(snr_val, 100.0) / 100.0

    # Max components: just the node count, normalised by MAX_NODES
    num_nodes = len(nodes)
    comp_norm = min(num_nodes, MAX_NODES) / MAX_NODES

    return [wl_norm, pwr_norm, snr_norm, comp_norm]


def _example_to_cvae_data(example: dict[str, Any]) -> Optional[Data]:
    """Convert a single JSONL example into a PyG Data object for CVAE training.

    The Data object contains:
        - x: node features [N, 29]
        - edge_index: [2, E]
        - condition: [4]
        - num_nodes_target: scalar (number of nodes)
        - node_types: [N] int tensor (component type indices)
        - node_params: [N, NUM_PARAMS] float tensor (normalised params)
    """
    nodes = example.get("nodes", [])
    if len(nodes) < 2:
        return None
    if len(nodes) > MAX_NODES:
        return None

    # Build node-id -> index mapping
    id_to_idx: dict[str, int] = {}
    for i, n in enumerate(nodes):
        nid = n.get("id", f"n{i}")
        id_to_idx[nid] = i

    # Node features [N, 29]
    x_rows: list[list[float]] = []
    type_indices: list[int] = []
    param_rows: list[list[float]] = []

    for n in nodes:
        x_rows.append(encode_node(n))

        comp_type = n.get("type", "waveguide")
        type_idx = _TYPE_INDEX.get(comp_type, _TYPE_INDEX["waveguide"])
        type_indices.append(type_idx)

        # Extract normalised params (last 14 values of encode_node output)
        param_rows.append(x_rows[-1][NUM_COMPONENT_TYPES:])

    # Edge index [2, E]
    edges = example.get("edges", [])
    src_list: list[int] = []
    dst_list: list[int] = []
    for e in edges:
        s = e.get("source", e.get("src"))
        t = e.get("target", e.get("dst"))
        if s in id_to_idx and t in id_to_idx:
            src_list.append(id_to_idx[s])
            dst_list.append(id_to_idx[t])

    # Condition vector
    condition = _extract_condition(example)

    # Assemble Data
    data = Data()
    data.x = torch.tensor(x_rows, dtype=torch.float)
    data.edge_index = (
        torch.tensor([src_list, dst_list], dtype=torch.long)
        if len(src_list) > 0
        else torch.zeros((2, 0), dtype=torch.long)
    )
    data.condition = torch.tensor(condition, dtype=torch.float)
    data.num_nodes_target = torch.tensor(len(nodes), dtype=torch.long)
    data.node_types = torch.tensor(type_indices, dtype=torch.long)
    data.node_params = torch.tensor(param_rows, dtype=torch.float)

    return data


def load_cvae_dataset(path: str | Path) -> list[Data]:
    """Read a JSONL file and convert each line to a CVAE training Data object."""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Dataset not found: {path}")

    dataset: list[Data] = []
    skipped = 0
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                example = json.loads(line)
            except json.JSONDecodeError:
                skipped += 1
                continue
            data = _example_to_cvae_data(example)
            if data is not None:
                dataset.append(data)
            else:
                skipped += 1

    print(f"[load_cvae_dataset] Loaded {len(dataset)} graphs from {path} "
          f"(skipped {skipped})")
    return dataset


# ---------------------------------------------------------------------------
# 2. Collation helpers -- build padded batch targets for the decoder
# ---------------------------------------------------------------------------

def _collate_targets(batch) -> dict[str, torch.Tensor]:
    """Build padded target tensors from a batched Data object.

    Returns dict with:
        - num_nodes: [B] long tensor
        - node_types: [B, max_N] long tensor (padded with -1)
        - node_params: [B, max_N, NUM_PARAMS] float tensor (padded with 0)
        - node_features: [B, max_N, NODE_FEATURE_DIM] float tensor for teacher forcing
    """
    # Determine per-graph node counts from batch vector
    batch_vec = batch.batch  # [total_nodes]
    batch_size = batch_vec.max().item() + 1

    num_nodes_list = []
    for b in range(batch_size):
        mask = batch_vec == b
        num_nodes_list.append(mask.sum().item())
    num_nodes = torch.tensor(num_nodes_list, dtype=torch.long, device=batch.x.device)

    max_n = num_nodes.max().item()

    # Pad node types and params
    node_types_padded = torch.full(
        (batch_size, max_n), -1, dtype=torch.long, device=batch.x.device
    )
    node_params_padded = torch.zeros(
        batch_size, max_n, NUM_PARAMS, dtype=torch.float, device=batch.x.device
    )
    node_features_padded = torch.zeros(
        batch_size, max_n, NODE_FEATURE_DIM, dtype=torch.float, device=batch.x.device
    )

    offset = 0
    for b in range(batch_size):
        n = num_nodes_list[b]
        node_types_padded[b, :n] = batch.node_types[offset:offset + n]
        node_params_padded[b, :n] = batch.node_params[offset:offset + n]
        node_features_padded[b, :n] = batch.x[offset:offset + n]
        offset += n

    return {
        "num_nodes": num_nodes,
        "node_types": node_types_padded,
        "node_params": node_params_padded,
        "node_features": node_features_padded,
    }


def _collate_conditions(batch) -> torch.Tensor:
    """Extract per-graph condition vectors from a batched Data object.

    Returns [B, CONDITION_DIM] tensor.
    """
    batch_vec = batch.batch
    batch_size = batch_vec.max().item() + 1

    # condition is stored as a flat [B*4] tensor after batching; reshape
    conditions = batch.condition.view(batch_size, CONDITION_DIM)
    return conditions


# ---------------------------------------------------------------------------
# 3. Validation: generate circuits and check validity
# ---------------------------------------------------------------------------

def _validate_circuit(circuit: dict) -> bool:
    """Check if a generated circuit is structurally valid.

    A valid circuit must:
    1. Have at least 2 nodes
    2. Have at least 1 edge
    3. All edge indices reference existing nodes
    4. Have at least one source-like component (type_idx 0 = laser_source)
    5. Have at least one detector-like component (type_idx 5 = photodetector)
    """
    nodes = circuit.get("nodes", [])
    edges = circuit.get("edges", [])
    num_nodes = circuit.get("num_nodes", len(nodes))

    if num_nodes < 2:
        return False
    if len(nodes) < 2:
        return False
    if len(edges) < 1:
        return False

    # Check edge indices
    for i, j in edges:
        if i < 0 or i >= num_nodes or j < 0 or j >= num_nodes:
            return False

    # Check for at least one source and one detector
    type_indices = {n["type_idx"] for n in nodes}
    has_source = 0 in type_indices  # laser_source
    has_detector = 5 in type_indices  # photodetector

    return has_source and has_detector


def validate_generation(
    model: PhotonicCircuitCVAE,
    device: torch.device,
    num_samples: int = 100,
    temperature: float = 1.0,
) -> dict[str, float]:
    """Generate circuits and report validity statistics."""
    model.eval()

    # Use a range of conditions for diversity
    valid_count = 0
    total_nodes = 0
    total_edges = 0

    for i in range(num_samples):
        # Vary the condition across samples
        wl_norm = 0.3 + 0.4 * (i % 10) / 10  # wavelength variety
        pwr_norm = 0.2 + 0.6 * ((i // 10) % 5) / 5
        snr_norm = 0.3 + 0.4 * (i % 7) / 7
        comp_norm = 0.1 + 0.3 * (i % 5) / 5

        condition = torch.tensor(
            [[wl_norm, pwr_norm, snr_norm, comp_norm]],
            dtype=torch.float,
            device=device,
        )

        candidates = model.generate(condition, num_samples=1, temperature=temperature)
        circuit = candidates[0]

        if _validate_circuit(circuit):
            valid_count += 1

        total_nodes += circuit["num_nodes"]
        total_edges += len(circuit["edges"])

    validity_rate = valid_count / num_samples
    avg_nodes = total_nodes / num_samples
    avg_edges = total_edges / num_samples

    return {
        "validity_rate": validity_rate,
        "avg_nodes": avg_nodes,
        "avg_edges": avg_edges,
        "num_samples": num_samples,
    }


# ---------------------------------------------------------------------------
# 4. Training loop
# ---------------------------------------------------------------------------

def train_cvae(
    data_path: str | Path,
    epochs: int = 200,
    lr: float = 1e-3,
    batch_size: int = 32,
    save_path: str | Path = "models/cvae_v1.pt",
    kl_anneal_epochs: int = 20,
    device: str | None = None,
    validate_every: int = 10,
    gen_samples: int = 100,
) -> float:
    """Full training loop for the CVAE generative model.

    Parameters
    ----------
    data_path : path to JSONL training data
    epochs : number of training epochs
    lr : learning rate for Adam
    batch_size : mini-batch size
    save_path : where to save the best model checkpoint
    kl_anneal_epochs : number of epochs to linearly anneal KL weight from 0 to 1
    device : 'cpu', 'cuda', or None (auto-detect)
    validate_every : run generation validation every N epochs
    gen_samples : number of circuits to generate during validation

    Returns
    -------
    float : best validation loss achieved
    """
    # ---- Device ----
    if device is None:
        device = "cuda" if torch.cuda.is_available() else "cpu"
    dev = torch.device(device)
    print(f"[train_cvae] Using device: {dev}")

    # ---- Data ----
    dataset = load_cvae_dataset(data_path)
    if len(dataset) == 0:
        raise ValueError("Dataset is empty after loading. Check your JSONL file.")

    # 90/10 split
    n_val = max(1, int(len(dataset) * 0.1))
    n_train = len(dataset) - n_val

    generator = torch.Generator().manual_seed(42)
    train_set, val_set = torch.utils.data.random_split(
        dataset, [n_train, n_val], generator=generator
    )
    print(f"[train_cvae] Train: {n_train}  |  Val: {n_val}")

    train_loader = DataLoader(list(train_set), batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(list(val_set), batch_size=batch_size, shuffle=False)

    # ---- Model ----
    model = PhotonicCircuitCVAE().to(dev)
    total_params = sum(p.numel() for p in model.parameters())
    print(f"[train_cvae] Model parameters: {total_params:,}")

    optimizer = Adam(model.parameters(), lr=lr)

    # ---- Training loop ----
    best_val_loss = float("inf")
    save_path = Path(save_path)
    save_path.parent.mkdir(parents=True, exist_ok=True)

    for epoch in range(1, epochs + 1):
        t0 = time.time()

        # KL annealing: linearly increase from 0 to 1 over first kl_anneal_epochs
        if epoch <= kl_anneal_epochs:
            kl_weight = epoch / kl_anneal_epochs
        else:
            kl_weight = 1.0

        # -- Train --
        model.train()
        train_loss_accum = 0.0
        train_metrics_accum: dict[str, float] = {}
        train_batches = 0

        for batch in train_loader:
            batch = batch.to(dev)
            optimizer.zero_grad()

            # Extract conditions and targets
            condition = _collate_conditions(batch)
            targets = _collate_targets(batch)

            # Forward pass with teacher forcing
            mu, logvar, outputs = model(
                batch,
                condition,
                target_num_nodes=targets["num_nodes"],
                target_node_features=targets["node_features"],
            )

            # Compute loss
            loss, metrics = model.loss(mu, logvar, outputs, targets, kl_weight=kl_weight)

            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), max_norm=5.0)
            optimizer.step()

            train_loss_accum += loss.item()
            for k, v in metrics.items():
                train_metrics_accum[k] = train_metrics_accum.get(k, 0.0) + v
            train_batches += 1

        train_avg_loss = train_loss_accum / max(train_batches, 1)
        train_avg = {k: v / max(train_batches, 1) for k, v in train_metrics_accum.items()}

        # -- Validate --
        model.eval()
        val_loss_accum = 0.0
        val_metrics_accum: dict[str, float] = {}
        val_batches = 0

        with torch.no_grad():
            for batch in val_loader:
                batch = batch.to(dev)
                condition = _collate_conditions(batch)
                targets = _collate_targets(batch)

                mu, logvar, outputs = model(
                    batch,
                    condition,
                    target_num_nodes=targets["num_nodes"],
                    target_node_features=targets["node_features"],
                )

                loss, metrics = model.loss(mu, logvar, outputs, targets, kl_weight=kl_weight)

                val_loss_accum += loss.item()
                for k, v in metrics.items():
                    val_metrics_accum[k] = val_metrics_accum.get(k, 0.0) + v
                val_batches += 1

        val_avg_loss = val_loss_accum / max(val_batches, 1)
        val_avg = {k: v / max(val_batches, 1) for k, v in val_metrics_accum.items()}

        elapsed = time.time() - t0

        # -- Checkpoint --
        improved = ""
        if val_avg_loss < best_val_loss:
            best_val_loss = val_avg_loss
            torch.save(
                {
                    "epoch": epoch,
                    "model_state_dict": model.state_dict(),
                    "optimizer_state_dict": optimizer.state_dict(),
                    "val_loss": best_val_loss,
                    "kl_weight": kl_weight,
                    "config": {
                        "latent_dim": LATENT_DIM,
                        "condition_dim": CONDITION_DIM,
                        "max_nodes": MAX_NODES,
                        "num_component_types": NUM_COMPONENT_TYPES,
                        "num_params": NUM_PARAMS,
                    },
                },
                save_path,
            )
            improved = "  *best*"

        # -- Print --
        print(
            f"Epoch {epoch:3d}/{epochs} "
            f"| kl_w {kl_weight:.2f} "
            f"| train {train_avg_loss:.4f} "
            f"(recon={train_avg.get('recon', 0):.4f} "
            f"type={train_avg.get('type', 0):.4f} "
            f"param={train_avg.get('param', 0):.4f} "
            f"kl={train_avg.get('kl', 0):.4f}) "
            f"| val {val_avg_loss:.4f} "
            f"| {elapsed:.1f}s{improved}"
        )

        # -- Generation validation --
        if epoch % validate_every == 0 or epoch == epochs:
            gen_stats = validate_generation(
                model, dev, num_samples=gen_samples, temperature=1.0
            )
            print(
                f"  [gen] validity={gen_stats['validity_rate']:.1%} "
                f"avg_nodes={gen_stats['avg_nodes']:.1f} "
                f"avg_edges={gen_stats['avg_edges']:.1f}"
            )

    print(f"\n[train_cvae] Best val loss: {best_val_loss:.6f}")
    print(f"[train_cvae] Model saved to: {save_path}")
    return best_val_loss


# ---------------------------------------------------------------------------
# 5. CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Train conditional VAE for photonic circuit generation."
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
        default=200,
        help="Number of training epochs (default: 200)",
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
        default="models/cvae_v1.pt",
        help="Path to save best model checkpoint",
    )
    parser.add_argument(
        "--kl-anneal-epochs",
        type=int,
        default=20,
        help="Epochs to linearly anneal KL weight from 0 to 1 (default: 20)",
    )
    parser.add_argument(
        "--device",
        type=str,
        default=None,
        help="Device: cpu, cuda, or auto-detect (default: auto)",
    )
    parser.add_argument(
        "--validate-every",
        type=int,
        default=10,
        help="Run generation validation every N epochs (default: 10)",
    )
    parser.add_argument(
        "--gen-samples",
        type=int,
        default=100,
        help="Number of circuits to generate during validation (default: 100)",
    )

    args = parser.parse_args()

    best_val = train_cvae(
        data_path=args.data,
        epochs=args.epochs,
        lr=args.lr,
        batch_size=args.batch_size,
        save_path=args.save,
        kl_anneal_epochs=args.kl_anneal_epochs,
        device=args.device,
        validate_every=args.validate_every,
        gen_samples=args.gen_samples,
    )

    sys.exit(0 if math.isfinite(best_val) else 1)


if __name__ == "__main__":
    main()
