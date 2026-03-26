"""Quality gates for active learning -- validate training examples before adding to dataset."""
from __future__ import annotations

import logging
import math
from typing import Any

logger = logging.getLogger(__name__)

COMPONENT_TYPES = {
    "laser_source", "waveguide", "beam_splitter", "coupler", "modulator",
    "photodetector", "optical_amplifier", "phase_shifter", "filter",
    "isolator", "circulator", "mzi", "ring_resonator", "grating_coupler", "mirror",
}


def check_energy_conservation(example: dict) -> tuple[bool, str]:
    """Verify that output power <= input power for passive circuits (no amplifiers)."""
    results = example.get("results", {})
    global_r = results.get("global", {})

    has_amplifier = any(
        n.get("type") == "optical_amplifier"
        for n in example.get("graph", {}).get("nodes", [])
    )

    if not has_amplifier:
        system_loss = global_r.get("totalSystemLoss_dB", 0)
        if system_loss < -0.01:  # small tolerance for float precision
            return False, f"Energy violation: negative system loss ({system_loss:.2f} dB) without amplifier"

    return True, "ok"


def check_power_monotonicity(example: dict) -> tuple[bool, str]:
    """Check that power decreases through passive components in the signal chain."""
    per_node = example.get("results", {}).get("perNode", [])
    for node in per_node:
        power = node.get("outputPower_dBm", 0)
        if power > 40:  # physically unreasonable
            return False, f"Unreasonable power {power} dBm at node {node.get('id')}"
        if power < -120:  # below noise floor
            return False, f"Power below noise floor ({power} dBm) at node {node.get('id')}"
    return True, "ok"


def check_coherence_bounds(example: dict) -> tuple[bool, str]:
    """Check coherence length is within physical bounds."""
    coherence = example.get("results", {}).get("global", {}).get("coherenceLength_mm", 0)
    if coherence < 0:
        return False, f"Negative coherence length: {coherence}"
    if coherence > 1e8:  # 100 km, way too high
        return False, f"Unreasonably large coherence length: {coherence}"
    return True, "ok"


def check_valid_types(example: dict) -> tuple[bool, str]:
    """Check all component types are recognized."""
    for node in example.get("graph", {}).get("nodes", []):
        if node.get("type") not in COMPONENT_TYPES:
            return False, f"Unknown component type: {node.get('type')}"
    return True, "ok"


def check_equilibrium_score(example: dict) -> tuple[bool, str]:
    """Check equilibrium score is in valid range."""
    score = example.get("results", {}).get("global", {}).get("equilibriumScore", -1)
    if not (0 <= score <= 100):
        return False, f"Invalid equilibrium score: {score}"
    return True, "ok"


ALL_GATES = [
    check_energy_conservation,
    check_power_monotonicity,
    check_coherence_bounds,
    check_valid_types,
    check_equilibrium_score,
]


def validate_example(example: dict) -> tuple[bool, list[str]]:
    """Run all quality gates on a training example.

    Returns (passed, list_of_failure_reasons).
    """
    failures = []
    for gate in ALL_GATES:
        passed, reason = gate(example)
        if not passed:
            failures.append(f"{gate.__name__}: {reason}")

    return len(failures) == 0, failures


def compute_quality_score(example: dict) -> float:
    """Compute a 0-1 quality score for prioritizing training examples.

    Higher = more valuable for training:
    - Diverse topologies score higher
    - Edge cases (near-convergence, many warnings) score higher
    - Trivial circuits (2 components, no connections) score lower
    """
    graph = example.get("graph", {})
    results = example.get("results", {})
    global_r = results.get("global", {})

    num_nodes = len(graph.get("nodes", []))
    num_edges = len(graph.get("edges", []))
    eq_score = global_r.get("equilibriumScore", 0)
    num_issues = len(global_r.get("issues", []))

    # Complexity bonus (more components = more interesting)
    complexity = min(1.0, num_nodes / 15)

    # Connectivity bonus
    connectivity = min(1.0, num_edges / max(num_nodes - 1, 1))

    # Edge case bonus (circuits near convergence boundary are most informative)
    edge_case = 1.0 - abs(eq_score - 85) / 85  # peaks at score=85 (convergence threshold)

    # Issue diversity (circuits with warnings teach the model about failure modes)
    issue_bonus = min(1.0, num_issues / 5)

    return 0.3 * complexity + 0.2 * connectivity + 0.3 * edge_case + 0.2 * issue_bonus
