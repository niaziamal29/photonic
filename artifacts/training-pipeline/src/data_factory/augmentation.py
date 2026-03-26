"""Data augmentation utilities for photonic circuit training examples.

Provides three augmentation strategies:

1. **Parameter noise** -- add Gaussian noise to numerical component parameters.
2. **Component swapping** -- randomly replace one passive component with another.
3. **Batch augmentation** -- apply a mix of augmentations to inflate a dataset.
"""

from __future__ import annotations

import copy
import random
from typing import Any

from .topology_templates import PARAM_RANGES, PASSIVE_TYPES


def augment_params(circuit: dict[str, Any], noise_std: float = 0.05) -> dict[str, Any]:
    """Add Gaussian noise to all numerical parameters in *circuit*.

    Each parameter is perturbed by ``param *= (1 + N(0, noise_std))`` and then
    clamped to the physical bounds defined in :data:`PARAM_RANGES`.

    Parameters
    ----------
    circuit:
        Circuit dictionary (not modified in place).
    noise_std:
        Standard deviation of the relative Gaussian noise.

    Returns
    -------
    dict
        A deep copy of *circuit* with noisy parameters.
    """
    result = copy.deepcopy(circuit)
    for comp in result["components"]:
        ctype = comp["type"]
        ranges = PARAM_RANGES.get(ctype, {})
        for pname, value in list(comp["params"].items()):
            if not isinstance(value, (int, float)):
                continue
            noise_factor = 1.0 + random.gauss(0.0, noise_std)
            noisy = float(value) * noise_factor
            # Clamp to physical bounds if known
            if pname in ranges:
                lo, hi = ranges[pname]
                noisy = max(lo, min(hi, noisy))
            comp["params"][pname] = noisy
    return result


def swap_component(circuit: dict[str, Any]) -> dict[str, Any]:
    """Randomly swap one passive component for another passive type.

    Only components whose type is in :data:`PASSIVE_TYPES` are eligible.
    The replacement component receives freshly sampled random parameters
    from the new type's range, and inherits the original's position and ID
    so that connections remain valid.

    Parameters
    ----------
    circuit:
        Circuit dictionary (not modified in place).

    Returns
    -------
    dict
        A deep copy of *circuit* with one component swapped, or an
        unchanged copy if no swappable components exist.
    """
    result = copy.deepcopy(circuit)
    candidates = [
        (i, c) for i, c in enumerate(result["components"]) if c["type"] in PASSIVE_TYPES
    ]
    if not candidates:
        return result

    idx, original = random.choice(candidates)

    # Pick a different passive type
    other_types = [t for t in PASSIVE_TYPES if t != original["type"]]
    if not other_types:
        return result

    new_type = random.choice(other_types)
    new_params: dict[str, float] = {}
    for pname, (lo, hi) in PARAM_RANGES.get(new_type, {}).items():
        new_params[pname] = random.uniform(lo, hi)

    result["components"][idx] = {
        "id": original["id"],  # keep ID to preserve connections
        "type": new_type,
        "label": new_type,
        "x": original["x"],
        "y": original["y"],
        "params": new_params,
    }
    return result


def augment_dataset(
    examples: list[dict[str, Any]],
    augmentations_per: int = 3,
    noise_std: float = 0.05,
) -> list[dict[str, Any]]:
    """Generate augmented versions of each example in *examples*.

    For each original example, up to *augmentations_per* augmented copies are
    produced using a random mix of parameter noise and component swapping.

    Parameters
    ----------
    examples:
        List of training example dicts.  Each must contain a ``"graph"`` key
        with ``"components"`` and ``"connections"`` sub-keys.
    augmentations_per:
        Number of augmented copies to generate per original example.
    noise_std:
        Standard deviation for parameter noise augmentation.

    Returns
    -------
    list[dict]
        List of augmented example dicts (does **not** include originals).
    """
    augmented: list[dict[str, Any]] = []

    for example in examples:
        graph = {
            "components": example.get("graph", example).get("components", []),
            "connections": example.get("graph", example).get("connections", []),
        }

        for _ in range(augmentations_per):
            aug_circuit = copy.deepcopy(graph)

            # Apply a random combination of augmentations
            if random.random() < 0.7:
                aug_circuit = augment_params(aug_circuit, noise_std=noise_std)
            if random.random() < 0.4:
                aug_circuit = swap_component(aug_circuit)

            aug_example = copy.deepcopy(example)
            if "graph" in aug_example:
                aug_example["graph"]["components"] = aug_circuit["components"]
                aug_example["graph"]["connections"] = aug_circuit["connections"]
            else:
                aug_example["components"] = aug_circuit["components"]
                aug_example["connections"] = aug_circuit["connections"]

            # Mark as augmented in metadata
            meta = aug_example.get("metadata", {})
            meta["source"] = "synthetic_augmented"
            aug_example["metadata"] = meta

            augmented.append(aug_example)

    return augmented
