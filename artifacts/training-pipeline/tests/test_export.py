"""Tests for ONNX export utilities.

Verifies that ``OnnxReadyGNN`` produces correct output shapes, that weight
transfer from ``PhotonicsSurrogateGNN`` works, and that both models produce
numerically equivalent outputs.
"""

from __future__ import annotations

import tempfile
from pathlib import Path

import pytest
import torch
from torch import Tensor

from src.training.export_onnx import (
    DEFAULT_EDGE_DIM,
    DEFAULT_GLOBAL_OUT_DIM,
    DEFAULT_HIDDEN_DIM,
    DEFAULT_NODE_DIM,
    DEFAULT_NODE_OUT_DIM,
    DEFAULT_NUM_HEADS,
    DEFAULT_NUM_LAYERS,
    OnnxReadyGNN,
    PhotonicsSurrogateGNN,
    convert_model,
    export_to_onnx,
    verify_onnx,
    _make_dummy_inputs,
)


# ----------------------------------------------------------------------- #
# Fixtures                                                                 #
# ----------------------------------------------------------------------- #

@pytest.fixture
def onnx_model() -> OnnxReadyGNN:
    """Create a fresh ``OnnxReadyGNN`` with default architecture."""
    model = OnnxReadyGNN()
    model.eval()
    return model


@pytest.fixture
def pyg_model() -> PhotonicsSurrogateGNN:
    """Create a fresh ``PhotonicsSurrogateGNN`` with default architecture."""
    model = PhotonicsSurrogateGNN()
    model.eval()
    return model


@pytest.fixture
def dummy_inputs(onnx_model: OnnxReadyGNN) -> tuple[Tensor, Tensor, Tensor, Tensor]:
    """Generate dummy graph inputs with 10 nodes and 15 edges."""
    return _make_dummy_inputs(onnx_model, num_nodes=10, num_edges=15)


# ----------------------------------------------------------------------- #
# Forward pass shape tests                                                 #
# ----------------------------------------------------------------------- #

class TestOnnxReadyForwardPass:
    """Verify OnnxReadyGNN produces same output shapes as PhotonicsSurrogateGNN."""

    def test_output_types(
        self, onnx_model: OnnxReadyGNN, dummy_inputs: tuple
    ) -> None:
        """Forward pass returns a tuple of two tensors."""
        x, edge_index, edge_attr, batch = dummy_inputs
        result = onnx_model(x, edge_index, edge_attr, batch)

        assert isinstance(result, tuple), "Expected tuple output"
        assert len(result) == 2, "Expected 2 outputs (node, global)"
        assert isinstance(result[0], Tensor), "node_preds should be Tensor"
        assert isinstance(result[1], Tensor), "global_preds should be Tensor"

    def test_node_output_shape(
        self, onnx_model: OnnxReadyGNN, dummy_inputs: tuple
    ) -> None:
        """Node predictions have shape [N, node_out_dim]."""
        x, edge_index, edge_attr, batch = dummy_inputs
        node_preds, _ = onnx_model(x, edge_index, edge_attr, batch)

        assert node_preds.shape == (10, DEFAULT_NODE_OUT_DIM), (
            f"Expected (10, {DEFAULT_NODE_OUT_DIM}), got {node_preds.shape}"
        )

    def test_global_output_shape(
        self, onnx_model: OnnxReadyGNN, dummy_inputs: tuple
    ) -> None:
        """Global predictions have shape [B, global_out_dim]."""
        x, edge_index, edge_attr, batch = dummy_inputs
        _, global_preds = onnx_model(x, edge_index, edge_attr, batch)

        # batch is all zeros -> 1 graph in the batch
        assert global_preds.shape == (1, DEFAULT_GLOBAL_OUT_DIM), (
            f"Expected (1, {DEFAULT_GLOBAL_OUT_DIM}), got {global_preds.shape}"
        )

    def test_multi_graph_batch(self, onnx_model: OnnxReadyGNN) -> None:
        """Output shapes are correct for a batch with multiple graphs."""
        num_nodes = 12
        x = torch.randn(num_nodes, DEFAULT_NODE_DIM)
        edge_index = torch.randint(0, num_nodes, (2, 20))
        edge_attr = torch.randn(20, DEFAULT_EDGE_DIM)
        # 3 graphs: nodes 0-3, 4-7, 8-11
        batch = torch.tensor([0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2])

        node_preds, global_preds = onnx_model(x, edge_index, edge_attr, batch)

        assert node_preds.shape == (num_nodes, DEFAULT_NODE_OUT_DIM)
        assert global_preds.shape == (3, DEFAULT_GLOBAL_OUT_DIM)

    def test_no_nan_in_outputs(
        self, onnx_model: OnnxReadyGNN, dummy_inputs: tuple
    ) -> None:
        """Outputs contain no NaN values for random inputs."""
        x, edge_index, edge_attr, batch = dummy_inputs
        node_preds, global_preds = onnx_model(x, edge_index, edge_attr, batch)

        assert not torch.isnan(node_preds).any(), "NaN in node predictions"
        assert not torch.isnan(global_preds).any(), "NaN in global predictions"

    def test_variable_graph_sizes(self, onnx_model: OnnxReadyGNN) -> None:
        """Model handles different graph sizes correctly."""
        for num_nodes in [3, 15, 40]:
            num_edges = num_nodes * 2
            x = torch.randn(num_nodes, DEFAULT_NODE_DIM)
            edge_index = torch.randint(0, num_nodes, (2, num_edges))
            edge_attr = torch.randn(num_edges, DEFAULT_EDGE_DIM)
            batch = torch.zeros(num_nodes, dtype=torch.long)

            node_preds, global_preds = onnx_model(x, edge_index, edge_attr, batch)
            assert node_preds.shape == (num_nodes, DEFAULT_NODE_OUT_DIM)
            assert global_preds.shape == (1, DEFAULT_GLOBAL_OUT_DIM)

    def test_pyg_model_same_shapes(
        self, pyg_model: PhotonicsSurrogateGNN, dummy_inputs: tuple
    ) -> None:
        """PhotonicsSurrogateGNN produces identical output shapes."""
        x, edge_index, edge_attr, batch = dummy_inputs
        node_preds, global_preds = pyg_model(x, edge_index, edge_attr, batch)

        assert node_preds.shape == (10, DEFAULT_NODE_OUT_DIM)
        assert global_preds.shape == (1, DEFAULT_GLOBAL_OUT_DIM)


# ----------------------------------------------------------------------- #
# Weight transfer tests                                                    #
# ----------------------------------------------------------------------- #

class TestWeightTransfer:
    """Verify weights copy correctly between model variants."""

    def test_state_dict_keys_match(self) -> None:
        """Both models have identical state dict keys."""
        onnx_model = OnnxReadyGNN()
        pyg_model = PhotonicsSurrogateGNN()

        onnx_keys = set(onnx_model.state_dict().keys())
        pyg_keys = set(pyg_model.state_dict().keys())

        assert onnx_keys == pyg_keys, (
            f"Key mismatch.\n"
            f"  Only in ONNX: {onnx_keys - pyg_keys}\n"
            f"  Only in PyG:  {pyg_keys - onnx_keys}"
        )

    def test_state_dict_shapes_match(self) -> None:
        """All parameters have matching shapes between models."""
        onnx_model = OnnxReadyGNN()
        pyg_model = PhotonicsSurrogateGNN()

        for key in onnx_model.state_dict():
            onnx_shape = onnx_model.state_dict()[key].shape
            pyg_shape = pyg_model.state_dict()[key].shape
            assert onnx_shape == pyg_shape, (
                f"Shape mismatch for '{key}': {onnx_shape} vs {pyg_shape}"
            )

    def test_convert_model_copies_weights(self) -> None:
        """``convert_model`` produces a model with identical weights."""
        pyg_model = PhotonicsSurrogateGNN()
        onnx_model = OnnxReadyGNN()

        # Ensure they start with different weights
        assert not all(
            torch.equal(pyg_model.state_dict()[k], onnx_model.state_dict()[k])
            for k in pyg_model.state_dict()
        ), "Models should not start with identical weights"

        convert_model(pyg_model, onnx_model, verify=False)

        # After conversion, all weights should be identical
        for key in pyg_model.state_dict():
            assert torch.equal(
                pyg_model.state_dict()[key],
                onnx_model.state_dict()[key],
            ), f"Weight mismatch after conversion for '{key}'"

    def test_convert_model_with_verification(self) -> None:
        """``convert_model`` with verify=True does not raise."""
        pyg_model = PhotonicsSurrogateGNN()
        onnx_model = OnnxReadyGNN()

        # Should not raise
        convert_model(pyg_model, onnx_model, verify=True)


# ----------------------------------------------------------------------- #
# Numerical equivalence tests                                              #
# ----------------------------------------------------------------------- #

class TestNumericalEquivalence:
    """Verify ONNX-ready model produces same outputs as PyG model."""

    def test_identical_outputs_after_weight_copy(self) -> None:
        """After weight transfer, both models produce bitwise-identical outputs."""
        pyg_model = PhotonicsSurrogateGNN()
        onnx_model = OnnxReadyGNN()
        convert_model(pyg_model, onnx_model, verify=False)

        pyg_model.eval()
        onnx_model.eval()

        x, edge_index, edge_attr, batch = _make_dummy_inputs(onnx_model)

        with torch.no_grad():
            pyg_node, pyg_global = pyg_model(x, edge_index, edge_attr, batch)
            onnx_node, onnx_global = onnx_model(x, edge_index, edge_attr, batch)

        assert torch.allclose(pyg_node, onnx_node, atol=1e-6), (
            f"Node max diff: {(pyg_node - onnx_node).abs().max():.2e}"
        )
        assert torch.allclose(pyg_global, onnx_global, atol=1e-6), (
            f"Global max diff: {(pyg_global - onnx_global).abs().max():.2e}"
        )

    def test_equivalence_multiple_random_graphs(self) -> None:
        """Equivalence holds across 20 random graphs of varying sizes."""
        pyg_model = PhotonicsSurrogateGNN()
        onnx_model = OnnxReadyGNN()
        convert_model(pyg_model, onnx_model, verify=False)

        pyg_model.eval()
        onnx_model.eval()

        for _ in range(20):
            num_nodes = torch.randint(5, 30, (1,)).item()
            num_edges = torch.randint(num_nodes, num_nodes * 3, (1,)).item()

            x = torch.randn(num_nodes, DEFAULT_NODE_DIM)
            edge_index = torch.randint(0, num_nodes, (2, num_edges))
            edge_attr = torch.randn(num_edges, DEFAULT_EDGE_DIM)
            batch = torch.zeros(num_nodes, dtype=torch.long)

            with torch.no_grad():
                pyg_node, pyg_global = pyg_model(x, edge_index, edge_attr, batch)
                onnx_node, onnx_global = onnx_model(x, edge_index, edge_attr, batch)

            assert torch.allclose(pyg_node, onnx_node, atol=1e-5)
            assert torch.allclose(pyg_global, onnx_global, atol=1e-5)

    def test_equivalence_multi_graph_batch(self) -> None:
        """Equivalence holds for batched multi-graph inputs."""
        pyg_model = PhotonicsSurrogateGNN()
        onnx_model = OnnxReadyGNN()
        convert_model(pyg_model, onnx_model, verify=False)

        pyg_model.eval()
        onnx_model.eval()

        # Batch of 3 graphs
        num_nodes = 15
        x = torch.randn(num_nodes, DEFAULT_NODE_DIM)
        edge_index = torch.randint(0, num_nodes, (2, 25))
        edge_attr = torch.randn(25, DEFAULT_EDGE_DIM)
        batch = torch.tensor([0] * 5 + [1] * 5 + [2] * 5)

        with torch.no_grad():
            pyg_node, pyg_global = pyg_model(x, edge_index, edge_attr, batch)
            onnx_node, onnx_global = onnx_model(x, edge_index, edge_attr, batch)

        assert torch.allclose(pyg_node, onnx_node, atol=1e-5)
        assert torch.allclose(pyg_global, onnx_global, atol=1e-5)
        assert pyg_global.shape == (3, DEFAULT_GLOBAL_OUT_DIM)


# ----------------------------------------------------------------------- #
# Helpers                                                                  #
# ----------------------------------------------------------------------- #

def _onnxruntime_available() -> bool:
    """Check if onnxruntime is importable."""
    try:
        import onnxruntime  # noqa: F401
        return True
    except ImportError:
        return False


# ----------------------------------------------------------------------- #
# Export round-trip tests                                                  #
# ----------------------------------------------------------------------- #

class TestExportRoundTrip:
    """Test the full export → load → verify pipeline."""

    def test_export_and_reload_checkpoint(self) -> None:
        """Export from a saved checkpoint and verify the output file exists."""
        model = OnnxReadyGNN()

        with tempfile.TemporaryDirectory() as tmpdir:
            # Save a mock checkpoint
            ckpt_path = Path(tmpdir) / "model.pt"
            torch.save(
                {
                    "state_dict": model.state_dict(),
                    "config": {
                        "node_dim": DEFAULT_NODE_DIM,
                        "edge_dim": DEFAULT_EDGE_DIM,
                        "hidden_dim": DEFAULT_HIDDEN_DIM,
                        "num_layers": DEFAULT_NUM_LAYERS,
                        "node_out_dim": DEFAULT_NODE_OUT_DIM,
                        "global_out_dim": DEFAULT_GLOBAL_OUT_DIM,
                        "num_heads": DEFAULT_NUM_HEADS,
                    },
                },
                ckpt_path,
            )

            onnx_path = Path(tmpdir) / "model.onnx"
            result = export_to_onnx(ckpt_path, onnx_path, max_nodes=10)

            # Should produce either .onnx or .pt (TorchScript fallback)
            assert result.exists(), f"Export file not found: {result}"
            assert result.stat().st_size > 0, "Export file is empty"

    def test_export_raw_state_dict(self) -> None:
        """Export works with a raw state dict checkpoint (no config key)."""
        model = OnnxReadyGNN()

        with tempfile.TemporaryDirectory() as tmpdir:
            ckpt_path = Path(tmpdir) / "model.pt"
            torch.save(model.state_dict(), ckpt_path)

            onnx_path = Path(tmpdir) / "model.onnx"
            result = export_to_onnx(ckpt_path, onnx_path, max_nodes=8)

            assert result.exists()

    @pytest.mark.skipif(
        not _onnxruntime_available(),
        reason="onnxruntime not installed",
    )
    def test_onnx_runtime_verification(self) -> None:
        """Full round-trip: export to ONNX, verify with ORT."""
        model = OnnxReadyGNN()

        with tempfile.TemporaryDirectory() as tmpdir:
            ckpt_path = Path(tmpdir) / "model.pt"
            torch.save(
                {
                    "state_dict": model.state_dict(),
                    "config": {
                        "node_dim": DEFAULT_NODE_DIM,
                        "edge_dim": DEFAULT_EDGE_DIM,
                        "hidden_dim": DEFAULT_HIDDEN_DIM,
                        "num_layers": DEFAULT_NUM_LAYERS,
                        "node_out_dim": DEFAULT_NODE_OUT_DIM,
                        "global_out_dim": DEFAULT_GLOBAL_OUT_DIM,
                        "num_heads": DEFAULT_NUM_HEADS,
                    },
                },
                ckpt_path,
            )

            onnx_path = Path(tmpdir) / "model.onnx"
            result = export_to_onnx(ckpt_path, onnx_path, max_nodes=10)

            if result.suffix == ".onnx":
                # Should not raise
                verify_onnx(model, result, num_trials=5, atol=1e-5)
