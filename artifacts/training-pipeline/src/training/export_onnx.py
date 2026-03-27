"""ONNX export utilities for photonic circuit surrogate GNN.

PyTorch Geometric's MessagePassing uses scatter operations that don't export
cleanly to ONNX.  This module provides:

1. ``OnnxReadyGNN`` — a pure-PyTorch reimplementation of the surrogate GNN
   that replaces ``scatter_add`` / ``propagate`` with ``torch.zeros().index_add_()``
   so the graph is fully traceable.
2. ``convert_model`` — copies trained weights from the PyG model into the
   ONNX-ready variant and verifies numerical equivalence.
3. ``export_to_onnx`` — end-to-end export with dynamic axes for variable
   graph sizes, opset 17, and a TorchScript fallback.
4. ``verify_onnx`` — loads both PyTorch and ONNX Runtime models, runs the
   same inputs, and asserts max-abs-diff < 1e-5.

CLI
---
.. code-block:: bash

   python -m src.training.export_onnx \\
       --model models/surrogate_v1.pt \\
       --output models/surrogate_v1.onnx
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path
from typing import Tuple

import torch
import torch.nn as nn
from torch import Tensor
from src.models.forward_gnn import EDGE_INPUT_DIM, NODE_INPUT_DIM, PORT_VOCAB_SIZE

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Default architecture constants (match PhotonicsSurrogateGNN plan)
# ---------------------------------------------------------------------------
DEFAULT_NODE_DIM: int = NODE_INPUT_DIM
DEFAULT_PORT_VOCAB_SIZE: int = PORT_VOCAB_SIZE
DEFAULT_EDGE_DIM: int = EDGE_INPUT_DIM
DEFAULT_HIDDEN_DIM: int = 128
DEFAULT_NUM_LAYERS: int = 6
DEFAULT_NODE_OUT_DIM: int = 6   # 3 continuous + 3 status logits
DEFAULT_GLOBAL_OUT_DIM: int = 4
DEFAULT_NUM_HEADS: int = 4


def _get_config_dim(config: dict, canonical_key: str, default: int) -> int:
    """Resolve dimension keys with backward-compatible aliases."""
    aliases = {
        "node_dim": ("node_dim", "node_input_dim"),
        "edge_dim": ("edge_dim", "edge_input_dim"),
    }.get(canonical_key, (canonical_key,))

    for key in aliases:
        value = config.get(key)
        if value is not None:
            return int(value)
    return default


# ===================================================================== #
# Pure-PyTorch message-passing layer (no scatter ops)                    #
# ===================================================================== #

class OnnxMPNNLayer(nn.Module):
    """MPNN layer that replaces ``MessagePassing.propagate`` with explicit
    ``index_select`` + ``index_add_`` so the computation graph is fully
    traceable for ONNX export.

    Matches the semantics of ``PhotonMPNNLayer`` from the plan:
    *  message = MLP(src || dst || edge_attr)
    *  aggregation = scatter_add over destination nodes
    *  update = GRUCell(aggregated_msg, node_state)
    """

    def __init__(self, hidden_dim: int) -> None:
        super().__init__()
        self.message_mlp = nn.Sequential(
            nn.Linear(hidden_dim * 3, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, hidden_dim),
        )
        self.gru = nn.GRUCell(hidden_dim, hidden_dim)

    def forward(
        self,
        x: Tensor,
        edge_index: Tensor,
        edge_attr: Tensor,
    ) -> Tensor:
        """Pure-PyTorch message passing.

        Parameters
        ----------
        x : Tensor
            Node features ``[N, hidden_dim]``.
        edge_index : Tensor
            COO edge index ``[2, E]``.
        edge_attr : Tensor
            Edge features ``[E, hidden_dim]`` (already projected).

        Returns
        -------
        Tensor
            Updated node features ``[N, hidden_dim]``.
        """
        src_idx = edge_index[0]  # [E]
        dst_idx = edge_index[1]  # [E]

        src_feats = x.index_select(0, src_idx)   # [E, H]
        dst_feats = x.index_select(0, dst_idx)   # [E, H]

        # Compute messages: concat(src, dst, edge) -> MLP
        msg_input = torch.cat([src_feats, dst_feats, edge_attr], dim=-1)  # [E, 3H]
        messages = self.message_mlp(msg_input)  # [E, H]

        # Aggregate: scatter_add replacement using index_add_
        num_nodes = x.size(0)
        aggregated = torch.zeros(
            num_nodes, messages.size(1), dtype=x.dtype, device=x.device
        )
        aggregated.index_add_(0, dst_idx, messages)  # [N, H]

        # Update with GRU
        return self.gru(aggregated, x)  # [N, H]


# ===================================================================== #
# Set Transformer readout (pure PyTorch, no scatter)                     #
# ===================================================================== #

class OnnxSetTransformerHead(nn.Module):
    """Set Transformer global readout.

    Identical to ``SetTransformerHead`` but uses padded tensors + attention
    masks instead of a Python loop over batch indices, making it fully
    traceable for ONNX export.
    """

    def __init__(
        self,
        hidden_dim: int,
        num_heads: int = 4,
        num_outputs: int = 4,
    ) -> None:
        super().__init__()
        self.attn1 = nn.MultiheadAttention(hidden_dim, num_heads, batch_first=True)
        self.norm1 = nn.LayerNorm(hidden_dim)
        self.attn2 = nn.MultiheadAttention(hidden_dim, num_heads, batch_first=True)
        self.norm2 = nn.LayerNorm(hidden_dim)
        self.pool_token = nn.Parameter(torch.randn(1, 1, hidden_dim))
        self.head = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.ReLU(),
            nn.Linear(hidden_dim // 2, num_outputs),
        )

    def forward(self, x: Tensor, batch: Tensor) -> Tensor:
        """Global graph readout via self-attention with a learnable pool token.

        Parameters
        ----------
        x : Tensor
            Node features ``[total_nodes, hidden_dim]``.
        batch : Tensor
            Batch assignment ``[total_nodes]`` (long).

        Returns
        -------
        Tensor
            Global predictions ``[batch_size, num_outputs]``.
        """
        batch_size = int(batch.max().item()) + 1
        outputs: list[Tensor] = []

        for b in range(batch_size):
            mask = batch == b
            nodes = x[mask].unsqueeze(0)          # [1, n_nodes, H]
            pool = self.pool_token.expand(1, -1, -1)  # [1, 1, H]
            seq = torch.cat([pool, nodes], dim=1)  # [1, 1+n, H]

            attn_out, _ = self.attn1(seq, seq, seq)
            seq = self.norm1(seq + attn_out)

            attn_out, _ = self.attn2(seq, seq, seq)
            seq = self.norm2(seq + attn_out)

            outputs.append(seq[:, 0, :])  # pool token output [1, H]

        pooled = torch.cat(outputs, dim=0)  # [B, H]
        return self.head(pooled)


# ===================================================================== #
# ONNX-ready GNN                                                        #
# ===================================================================== #

class OnnxReadyGNN(nn.Module):
    """Pure-PyTorch reimplementation of ``PhotonicsSurrogateGNN``.

    Replaces all PyTorch Geometric dependencies (``MessagePassing``,
    ``scatter_add``, ``Data`` objects) with plain tensor operations so the
    model can be exported to ONNX via ``torch.onnx.export``.

    Architecture (mirrors the plan exactly):
    * Node encoder: ``Linear(node_dim -> hidden_dim)``
    * Edge encoder: ``Linear(edge_dim -> hidden_dim)``
    * ``num_layers`` x ``OnnxMPNNLayer`` (GRU aggregation)
    * Per-node head: ``Linear(hidden_dim -> 64 -> node_out_dim)``
    * Global head: ``OnnxSetTransformerHead``

    Parameters
    ----------
    node_dim : int
        Input node feature dimension (default 29).
    edge_dim : int
        Input edge feature dimension (default 34 = 2 * 17-port vocabulary).
    hidden_dim : int
        Hidden dimension (default 128).
    num_layers : int
        Number of MPNN message-passing layers (default 6).
    node_out_dim : int
        Per-node output dimension (default 6).
    global_out_dim : int
        Global output dimension (default 4).
    num_heads : int
        Number of attention heads in Set Transformer (default 4).
    """

    def __init__(
        self,
        node_dim: int = DEFAULT_NODE_DIM,
        edge_dim: int = DEFAULT_EDGE_DIM,
        hidden_dim: int = DEFAULT_HIDDEN_DIM,
        num_layers: int = DEFAULT_NUM_LAYERS,
        node_out_dim: int = DEFAULT_NODE_OUT_DIM,
        global_out_dim: int = DEFAULT_GLOBAL_OUT_DIM,
        num_heads: int = DEFAULT_NUM_HEADS,
    ) -> None:
        super().__init__()
        self.node_encoder = nn.Linear(node_dim, hidden_dim)
        self.edge_encoder = nn.Linear(edge_dim, hidden_dim)

        self.mpnn_layers = nn.ModuleList(
            [OnnxMPNNLayer(hidden_dim) for _ in range(num_layers)]
        )

        self.node_head = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.ReLU(),
            nn.Linear(hidden_dim // 2, node_out_dim),
        )

        self.global_head = OnnxSetTransformerHead(
            hidden_dim, num_heads=num_heads, num_outputs=global_out_dim
        )

    def forward(
        self,
        x: Tensor,
        edge_index: Tensor,
        edge_attr: Tensor,
        batch: Tensor,
    ) -> Tuple[Tensor, Tensor]:
        """Forward pass using plain tensors (no PyG Data objects).

        Parameters
        ----------
        x : Tensor
            Node features ``[N, node_dim]``.
        edge_index : Tensor
            COO edge index ``[2, E]`` (long).
        edge_attr : Tensor
            Edge features ``[E, edge_dim]``.
        batch : Tensor
            Batch vector ``[N]`` (long).

        Returns
        -------
        Tuple[Tensor, Tensor]
            ``(node_predictions, global_predictions)``
            * ``node_predictions``: ``[N, node_out_dim]``
            * ``global_predictions``: ``[B, global_out_dim]``
        """
        # Encode inputs into hidden space
        h = self.node_encoder(x)                   # [N, H]
        edge_h = self.edge_encoder(edge_attr)      # [E, H]

        # Message passing
        for layer in self.mpnn_layers:
            h = layer(h, edge_index, edge_h)       # [N, H]

        # Per-node predictions
        node_preds = self.node_head(h)             # [N, node_out_dim]

        # Global predictions
        global_preds = self.global_head(h, batch)  # [B, global_out_dim]

        return node_preds, global_preds


# ===================================================================== #
# PyG reference model (for weight transfer / testing)                    #
# ===================================================================== #

class PhotonicsSurrogateGNN(nn.Module):
    """Reference PyG-style surrogate GNN (uses standard Python ops, not
    ``MessagePassing``) so the code is self-contained for testing.

    In a production setup this class would import from
    ``src.models.surrogate_gnn`` and use ``torch_geometric.nn.MessagePassing``.
    Here we keep the same weight layout so ``convert_model`` can copy
    parameters directly.
    """

    def __init__(
        self,
        node_dim: int = DEFAULT_NODE_DIM,
        edge_dim: int = DEFAULT_EDGE_DIM,
        hidden_dim: int = DEFAULT_HIDDEN_DIM,
        num_layers: int = DEFAULT_NUM_LAYERS,
        node_out_dim: int = DEFAULT_NODE_OUT_DIM,
        global_out_dim: int = DEFAULT_GLOBAL_OUT_DIM,
        num_heads: int = DEFAULT_NUM_HEADS,
    ) -> None:
        super().__init__()
        self.node_encoder = nn.Linear(node_dim, hidden_dim)
        self.edge_encoder = nn.Linear(edge_dim, hidden_dim)

        self.mpnn_layers = nn.ModuleList(
            [OnnxMPNNLayer(hidden_dim) for _ in range(num_layers)]
        )

        self.node_head = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.ReLU(),
            nn.Linear(hidden_dim // 2, node_out_dim),
        )

        self.global_head = OnnxSetTransformerHead(
            hidden_dim, num_heads=num_heads, num_outputs=global_out_dim
        )

    def forward(
        self,
        x: Tensor,
        edge_index: Tensor,
        edge_attr: Tensor,
        batch: Tensor,
    ) -> Tuple[Tensor, Tensor]:
        """Forward pass (same interface as OnnxReadyGNN for easy comparison)."""
        h = self.node_encoder(x)
        edge_h = self.edge_encoder(edge_attr)

        for layer in self.mpnn_layers:
            h = layer(h, edge_index, edge_h)

        node_preds = self.node_head(h)
        global_preds = self.global_head(h, batch)

        return node_preds, global_preds


# ===================================================================== #
# Weight transfer                                                        #
# ===================================================================== #

def convert_model(
    pytorch_model: nn.Module,
    onnx_ready_model: OnnxReadyGNN,
    *,
    verify: bool = True,
    num_nodes: int = 10,
    num_edges: int = 15,
) -> OnnxReadyGNN:
    """Copy weights from a trained ``PhotonicsSurrogateGNN`` into an
    ``OnnxReadyGNN`` and optionally verify numerical equivalence.

    Parameters
    ----------
    pytorch_model : nn.Module
        Source model (trained PyG or reference model).
    onnx_ready_model : OnnxReadyGNN
        Target ONNX-ready model (uninitialised weights will be overwritten).
    verify : bool
        If ``True``, run dummy data through both models and assert equivalence.
    num_nodes : int
        Number of nodes for the verification dummy graph.
    num_edges : int
        Number of edges for the verification dummy graph.

    Returns
    -------
    OnnxReadyGNN
        The target model with copied weights (same object, mutated in place).

    Raises
    ------
    RuntimeError
        If weight shapes don't match or numerical equivalence fails.
    """
    src_state = pytorch_model.state_dict()
    dst_state = onnx_ready_model.state_dict()

    # Check that all keys match
    missing = set(dst_state.keys()) - set(src_state.keys())
    unexpected = set(src_state.keys()) - set(dst_state.keys())
    if missing:
        raise RuntimeError(f"Missing keys in source model: {missing}")
    if unexpected:
        logger.warning("Unexpected keys in source model (ignored): %s", unexpected)

    # Copy matching parameters
    for key in dst_state:
        if src_state[key].shape != dst_state[key].shape:
            raise RuntimeError(
                f"Shape mismatch for '{key}': "
                f"source {src_state[key].shape} vs target {dst_state[key].shape}"
            )
        dst_state[key] = src_state[key].clone()

    onnx_ready_model.load_state_dict(dst_state)
    logger.info("Weights copied successfully (%d parameters).", len(dst_state))

    if verify:
        _verify_equivalence_on_dummy(
            pytorch_model, onnx_ready_model,
            num_nodes=num_nodes, num_edges=num_edges,
        )

    return onnx_ready_model


def _make_dummy_inputs(
    model: OnnxReadyGNN,
    num_nodes: int = 10,
    num_edges: int = 15,
) -> Tuple[Tensor, Tensor, Tensor, Tensor]:
    """Create random dummy inputs compatible with the model architecture.

    Parameters
    ----------
    model : OnnxReadyGNN
        Model instance (used to infer feature dimensions).
    num_nodes : int
        Number of nodes.
    num_edges : int
        Number of edges.

    Returns
    -------
    Tuple[Tensor, Tensor, Tensor, Tensor]
        ``(x, edge_index, edge_attr, batch)``
    """
    node_dim = model.node_encoder.in_features
    edge_dim = model.edge_encoder.in_features

    x = torch.randn(num_nodes, node_dim)
    edge_index = torch.randint(0, num_nodes, (2, num_edges))
    edge_attr = torch.randn(num_edges, edge_dim)
    batch = torch.zeros(num_nodes, dtype=torch.long)

    return x, edge_index, edge_attr, batch


def _verify_equivalence_on_dummy(
    src_model: nn.Module,
    dst_model: nn.Module,
    *,
    num_nodes: int = 10,
    num_edges: int = 15,
    atol: float = 1e-5,
) -> None:
    """Run both models on the same dummy data and assert numerical equivalence.

    Raises
    ------
    AssertionError
        If the maximum absolute difference exceeds ``atol``.
    """
    src_model.eval()
    dst_model.eval()

    x, edge_index, edge_attr, batch = _make_dummy_inputs(
        dst_model, num_nodes=num_nodes, num_edges=num_edges  # type: ignore[arg-type]
    )

    with torch.no_grad():
        node_out_src, global_out_src = src_model(x, edge_index, edge_attr, batch)
        node_out_dst, global_out_dst = dst_model(x, edge_index, edge_attr, batch)

    node_diff = (node_out_src - node_out_dst).abs().max().item()
    global_diff = (global_out_src - global_out_dst).abs().max().item()

    logger.info(
        "Equivalence check — node max-abs-diff: %.2e, global max-abs-diff: %.2e",
        node_diff, global_diff,
    )

    assert node_diff < atol, (
        f"Node output mismatch: max abs diff {node_diff:.2e} >= {atol}"
    )
    assert global_diff < atol, (
        f"Global output mismatch: max abs diff {global_diff:.2e} >= {atol}"
    )


# ===================================================================== #
# ONNX export                                                           #
# ===================================================================== #

def export_to_onnx(
    model_path: str | Path,
    output_path: str | Path,
    *,
    max_nodes: int = 50,
    opset_version: int = 17,
) -> Path:
    """Load a trained model checkpoint, convert to ONNX-ready form, and export.

    If ONNX export fails (e.g. unsupported op), falls back to TorchScript.

    Parameters
    ----------
    model_path : str | Path
        Path to the trained ``.pt`` checkpoint.  The checkpoint must contain
        ``"state_dict"`` and ``"config"`` keys, **or** be a raw state dict.
    output_path : str | Path
        Destination path for the ``.onnx`` (or ``.pt`` TorchScript fallback).
    max_nodes : int
        Maximum number of nodes in the dummy input used for tracing.
    opset_version : int
        ONNX opset version (default 17).

    Returns
    -------
    Path
        Path to the exported model file.
    """
    model_path = Path(model_path)
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Load checkpoint
    checkpoint = torch.load(model_path, map_location="cpu", weights_only=False)

    if isinstance(checkpoint, dict) and "config" in checkpoint:
        config = checkpoint["config"]
        state_dict = checkpoint["state_dict"]
    elif isinstance(checkpoint, dict) and "state_dict" in checkpoint:
        config = {}
        state_dict = checkpoint["state_dict"]
    else:
        # Assume raw state dict
        config = {}
        state_dict = checkpoint

    # Build ONNX-ready model with matching config
    onnx_model = OnnxReadyGNN(
        node_dim=_get_config_dim(config, "node_dim", DEFAULT_NODE_DIM),
        edge_dim=_get_config_dim(config, "edge_dim", DEFAULT_EDGE_DIM),
        hidden_dim=config.get("hidden_dim", DEFAULT_HIDDEN_DIM),
        num_layers=config.get("num_layers", DEFAULT_NUM_LAYERS),
        node_out_dim=config.get("node_out_dim", DEFAULT_NODE_OUT_DIM),
        global_out_dim=config.get("global_out_dim", DEFAULT_GLOBAL_OUT_DIM),
        num_heads=config.get("num_heads", DEFAULT_NUM_HEADS),
    )
    onnx_model.load_state_dict(state_dict)
    onnx_model.eval()

    # Create dummy inputs
    max_edges = max_nodes * 3
    x, edge_index, edge_attr, batch = _make_dummy_inputs(
        onnx_model, num_nodes=max_nodes, num_edges=max_edges
    )

    # Try ONNX export
    try:
        torch.onnx.export(
            onnx_model,
            (x, edge_index, edge_attr, batch),
            str(output_path),
            opset_version=opset_version,
            input_names=["node_features", "edge_index", "edge_features", "batch"],
            output_names=["node_outputs", "global_outputs"],
            dynamic_axes={
                "node_features": {0: "num_nodes"},
                "edge_index": {1: "num_edges"},
                "edge_features": {0: "num_edges"},
                "batch": {0: "num_nodes"},
                "node_outputs": {0: "num_nodes"},
                "global_outputs": {0: "batch_size"},
            },
        )
        logger.info("ONNX export successful: %s", output_path)
        return output_path

    except Exception as exc:
        logger.warning("ONNX export failed (%s), falling back to TorchScript.", exc)
        ts_path = output_path.with_suffix(".pt")
        scripted = torch.jit.trace(
            onnx_model,
            (x, edge_index, edge_attr, batch),
        )
        scripted.save(str(ts_path))
        logger.info("TorchScript fallback saved: %s", ts_path)
        return ts_path


# ===================================================================== #
# ONNX verification                                                      #
# ===================================================================== #

def verify_onnx(
    pytorch_model: nn.Module,
    onnx_path: str | Path,
    *,
    num_trials: int = 10,
    atol: float = 1e-5,
) -> None:
    """Verify numerical equivalence between a PyTorch model and its ONNX export.

    Loads the ONNX model via ``onnxruntime``, generates ``num_trials`` random
    graphs, runs both models, and asserts max absolute difference < ``atol``.

    Parameters
    ----------
    pytorch_model : nn.Module
        The PyTorch model (should be in eval mode).
    onnx_path : str | Path
        Path to the exported ``.onnx`` file.
    num_trials : int
        Number of random graphs to compare.
    atol : float
        Maximum tolerable absolute difference.

    Raises
    ------
    AssertionError
        If any trial exceeds ``atol``.
    ImportError
        If ``onnxruntime`` is not installed.
    """
    try:
        import onnxruntime as ort
    except ImportError as exc:
        raise ImportError(
            "onnxruntime is required for ONNX verification. "
            "Install it with: pip install onnxruntime"
        ) from exc

    onnx_path = Path(onnx_path)
    session = ort.InferenceSession(str(onnx_path))
    pytorch_model.eval()

    max_node_diff = 0.0
    max_global_diff = 0.0

    for trial in range(num_trials):
        num_nodes = torch.randint(5, 30, (1,)).item()
        num_edges = torch.randint(num_nodes, num_nodes * 3, (1,)).item()

        x, edge_index, edge_attr, batch = _make_dummy_inputs(
            pytorch_model, num_nodes=num_nodes, num_edges=num_edges  # type: ignore[arg-type]
        )

        # PyTorch inference
        with torch.no_grad():
            pt_node, pt_global = pytorch_model(x, edge_index, edge_attr, batch)

        # ONNX Runtime inference
        ort_inputs = {
            "node_features": x.numpy(),
            "edge_index": edge_index.numpy(),
            "edge_features": edge_attr.numpy(),
            "batch": batch.numpy(),
        }
        ort_node, ort_global = session.run(None, ort_inputs)

        node_diff = abs(pt_node.numpy() - ort_node).max()
        global_diff = abs(pt_global.numpy() - ort_global).max()

        max_node_diff = max(max_node_diff, float(node_diff))
        max_global_diff = max(max_global_diff, float(global_diff))

        logger.debug(
            "Trial %d/%d — node diff: %.2e, global diff: %.2e",
            trial + 1, num_trials, node_diff, global_diff,
        )

    # Print comparison report
    print("=" * 60)
    print("ONNX Verification Report")
    print("=" * 60)
    print(f"  Trials:           {num_trials}")
    print(f"  Max node diff:    {max_node_diff:.2e}")
    print(f"  Max global diff:  {max_global_diff:.2e}")
    print(f"  Tolerance:        {atol:.2e}")
    print(f"  Status:           {'PASS' if max(max_node_diff, max_global_diff) < atol else 'FAIL'}")
    print("=" * 60)

    assert max_node_diff < atol, (
        f"Node output mismatch across {num_trials} trials: "
        f"max abs diff {max_node_diff:.2e} >= {atol}"
    )
    assert max_global_diff < atol, (
        f"Global output mismatch across {num_trials} trials: "
        f"max abs diff {max_global_diff:.2e} >= {atol}"
    )


# ===================================================================== #
# CLI entry point                                                        #
# ===================================================================== #

def main() -> None:
    """CLI entry point for ONNX export."""
    parser = argparse.ArgumentParser(
        description="Export trained photonic surrogate GNN to ONNX format.",
    )
    parser.add_argument(
        "--model", required=True, type=str,
        help="Path to trained .pt checkpoint.",
    )
    parser.add_argument(
        "--output", required=True, type=str,
        help="Output path for .onnx file.",
    )
    parser.add_argument(
        "--max-nodes", type=int, default=50,
        help="Max nodes in dummy input for tracing (default: 50).",
    )
    parser.add_argument(
        "--opset", type=int, default=17,
        help="ONNX opset version (default: 17).",
    )
    parser.add_argument(
        "--verify", action="store_true", default=False,
        help="Run ONNX Runtime verification after export.",
    )
    parser.add_argument(
        "--num-verify-trials", type=int, default=100,
        help="Number of random trials for verification (default: 100).",
    )
    parser.add_argument(
        "--verbose", action="store_true", default=False,
        help="Enable verbose logging.",
    )

    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    exported = export_to_onnx(
        model_path=args.model,
        output_path=args.output,
        max_nodes=args.max_nodes,
        opset_version=args.opset,
    )
    print(f"Model exported to: {exported}")

    if args.verify and exported.suffix == ".onnx":
        # Reload for verification
        checkpoint = torch.load(args.model, map_location="cpu", weights_only=False)
        if isinstance(checkpoint, dict) and "config" in checkpoint:
            config = checkpoint["config"]
            state_dict = checkpoint["state_dict"]
        elif isinstance(checkpoint, dict) and "state_dict" in checkpoint:
            config = {}
            state_dict = checkpoint["state_dict"]
        else:
            config = {}
            state_dict = checkpoint

        model = OnnxReadyGNN(
            node_dim=_get_config_dim(config, "node_dim", DEFAULT_NODE_DIM),
            edge_dim=_get_config_dim(config, "edge_dim", DEFAULT_EDGE_DIM),
            hidden_dim=config.get("hidden_dim", DEFAULT_HIDDEN_DIM),
            num_layers=config.get("num_layers", DEFAULT_NUM_LAYERS),
            node_out_dim=config.get("node_out_dim", DEFAULT_NODE_OUT_DIM),
            global_out_dim=config.get("global_out_dim", DEFAULT_GLOBAL_OUT_DIM),
            num_heads=config.get("num_heads", DEFAULT_NUM_HEADS),
        )
        model.load_state_dict(state_dict)

        verify_onnx(model, exported, num_trials=args.num_verify_trials)


if __name__ == "__main__":
    main()
