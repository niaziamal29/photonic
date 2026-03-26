"""Training loops and utilities for photonic circuit ML models."""

from .train_surrogate import (
    COMPONENT_TYPES,
    NUM_TYPES,
    PARAM_NAMES,
    NUM_PARAMS,
    PARAM_RANGES,
    DEFAULT_PARAMS,
    encode_node,
    example_to_pyg,
    load_dataset,
    train,
)
from .train_generative import (
    load_cvae_dataset,
    train_cvae,
    validate_generation,
)

__all__ = [
    "COMPONENT_TYPES",
    "NUM_TYPES",
    "PARAM_NAMES",
    "NUM_PARAMS",
    "PARAM_RANGES",
    "DEFAULT_PARAMS",
    "encode_node",
    "example_to_pyg",
    "load_dataset",
    "train",
    "load_cvae_dataset",
    "train_cvae",
    "validate_generation",
]
