"""Data factory for generating synthetic photonic circuit training data."""

from .topology_templates import (
    COMPONENT_TYPES,
    PARAM_RANGES,
    linear_chain,
    mzi_interferometer,
    ring_filter,
    amplified_link,
    multi_stage_filter,
    star_coupler,
    generate_random_circuit,
)
from .circuit_generator import simulate_circuit, generate_dataset
from .augmentation import augment_params, swap_component, augment_dataset

__all__ = [
    "COMPONENT_TYPES",
    "PARAM_RANGES",
    "linear_chain",
    "mzi_interferometer",
    "ring_filter",
    "amplified_link",
    "multi_stage_filter",
    "star_coupler",
    "generate_random_circuit",
    "simulate_circuit",
    "generate_dataset",
    "augment_params",
    "swap_component",
    "augment_dataset",
]
