"""Surrogate GNN exposed at the import path used by the trainer."""

from __future__ import annotations

from ..training.export_onnx import PhotonicsSurrogateGNN as PhotonicSurrogateGNN

__all__ = ["PhotonicSurrogateGNN"]
