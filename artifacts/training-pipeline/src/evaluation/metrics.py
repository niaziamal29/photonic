"""Evaluation metrics for photonic circuit ML models.

Provides scalar regression metrics (MAE, R-squared), a structural validity
checker for generated circuits, and a comprehensive comparison report that
evaluates ML predictions against physics-engine ground truth.
"""

from __future__ import annotations

import json
import logging
import math
from pathlib import Path
from typing import Any, Sequence

import numpy as np

from ..data_factory.topology_templates import COMPONENT_TYPES, PARAM_RANGES

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Regression metrics
# ---------------------------------------------------------------------------


def mae(predictions: Sequence[float], targets: Sequence[float]) -> float:
    """Compute Mean Absolute Error between *predictions* and *targets*.

    Parameters
    ----------
    predictions:
        Predicted values.
    targets:
        Ground-truth target values.

    Returns
    -------
    float
        Mean absolute error.  Returns ``nan`` if inputs are empty.
    """
    preds = np.asarray(predictions, dtype=np.float64)
    tgts = np.asarray(targets, dtype=np.float64)
    if preds.size == 0:
        return float("nan")
    return float(np.mean(np.abs(preds - tgts)))


def r_squared(predictions: Sequence[float], targets: Sequence[float]) -> float:
    """Compute the coefficient of determination (R-squared).

    .. math::

        R^2 = 1 - \\frac{\\sum (y_i - \\hat{y}_i)^2}{\\sum (y_i - \\bar{y})^2}

    Parameters
    ----------
    predictions:
        Predicted values.
    targets:
        Ground-truth target values.

    Returns
    -------
    float
        R-squared score.  Can be negative if the model is worse than the mean
        predictor.  Returns ``nan`` for empty or constant targets.
    """
    preds = np.asarray(predictions, dtype=np.float64)
    tgts = np.asarray(targets, dtype=np.float64)
    if tgts.size == 0:
        return float("nan")
    ss_res = float(np.sum((tgts - preds) ** 2))
    ss_tot = float(np.sum((tgts - np.mean(tgts)) ** 2))
    if ss_tot == 0.0:
        return float("nan")
    return 1.0 - ss_res / ss_tot


# ---------------------------------------------------------------------------
# Structural validity
# ---------------------------------------------------------------------------


def _validate_circuit(circuit: dict[str, Any]) -> list[str]:
    """Return a list of validation issues for a single circuit.

    Checks performed:

    * At least one ``laser_source`` exists.
    * At least one ``photodetector`` exists.
    * All component types are from the known catalogue.
    * All connections reference valid component IDs.
    * All numerical parameters fall within physical bounds.
    """
    issues: list[str] = []
    components = circuit.get("components", [])
    connections = circuit.get("connections", [])

    if not components:
        issues.append("Circuit has no components")
        return issues

    comp_ids = {c["id"] for c in components}
    types = [c["type"] for c in components]

    # Source / detector checks
    if "laser_source" not in types:
        issues.append("Missing laser_source")
    if "photodetector" not in types:
        issues.append("Missing photodetector")

    # Unknown types
    for c in components:
        if c["type"] not in COMPONENT_TYPES:
            issues.append(f"Unknown component type: {c['type']}")

    # Connection integrity
    for conn in connections:
        if conn["fromComponentId"] not in comp_ids:
            issues.append(f"Connection references unknown source: {conn['fromComponentId']}")
        if conn["toComponentId"] not in comp_ids:
            issues.append(f"Connection references unknown target: {conn['toComponentId']}")

    # Parameter bounds
    for c in components:
        ranges = PARAM_RANGES.get(c["type"], {})
        for pname, value in c.get("params", {}).items():
            if not isinstance(value, (int, float)):
                continue
            if pname in ranges:
                lo, hi = ranges[pname]
                if value < lo - 1e-9 or value > hi + 1e-9:
                    issues.append(
                        f"{c['id']}.{pname} = {value:.6g} out of range [{lo}, {hi}]"
                    )

    return issues


def topology_validity_rate(generated_circuits: Sequence[dict[str, Any]]) -> float:
    """Compute the fraction of generated circuits that pass physical validity checks.

    Parameters
    ----------
    generated_circuits:
        Sequence of circuit dictionaries.

    Returns
    -------
    float
        Fraction in ``[0, 1]`` of circuits with zero validation issues.
        Returns ``nan`` for an empty input.
    """
    if not generated_circuits:
        return float("nan")
    valid = sum(1 for c in generated_circuits if not _validate_circuit(c))
    return valid / len(generated_circuits)


# ---------------------------------------------------------------------------
# Full accuracy report
# ---------------------------------------------------------------------------

#: The global scalar fields we compare between prediction and ground truth.
_GLOBAL_FIELDS: list[str] = [
    "equilibriumScore",
    "systemLoss",
    "totalOutputPower",
    "snr",
]


def prediction_accuracy_report(
    pred_file: str | Path,
    truth_file: str | Path,
) -> dict[str, Any]:
    """Produce a full accuracy report comparing ML predictions to physics-engine results.

    Both files are expected to be JSONL with matching lines (same circuit in
    the same order).  Each line must contain at least a ``simulation`` key with
    the global scalar fields listed in :data:`_GLOBAL_FIELDS`.

    Parameters
    ----------
    pred_file:
        Path to the JSONL file of ML predictions.
    truth_file:
        Path to the JSONL file of physics-engine ground truth.

    Returns
    -------
    dict
        Report dictionary with per-field MAE, R-squared, overall summary
        statistics, and optional per-example error vectors.
    """
    pred_path = Path(pred_file)
    truth_path = Path(truth_file)

    predictions_lines = pred_path.read_text(encoding="utf-8").strip().splitlines()
    truth_lines = truth_path.read_text(encoding="utf-8").strip().splitlines()

    n = min(len(predictions_lines), len(truth_lines))
    if n == 0:
        return {"error": "No examples to compare", "n": 0}

    if len(predictions_lines) != len(truth_lines):
        logger.warning(
            "Line count mismatch: predictions=%d, truth=%d; using first %d",
            len(predictions_lines),
            len(truth_lines),
            n,
        )

    # Accumulate per-field vectors
    field_preds: dict[str, list[float]] = {f: [] for f in _GLOBAL_FIELDS}
    field_truth: dict[str, list[float]] = {f: [] for f in _GLOBAL_FIELDS}
    per_example_errors: list[dict[str, float]] = []

    for i in range(n):
        pred = json.loads(predictions_lines[i])
        truth = json.loads(truth_lines[i])

        pred_sim = pred.get("simulation", pred)
        truth_sim = truth.get("simulation", truth)

        row_errors: dict[str, float] = {}
        for field in _GLOBAL_FIELDS:
            p_val = pred_sim.get(field)
            t_val = truth_sim.get(field)
            if p_val is not None and t_val is not None:
                field_preds[field].append(float(p_val))
                field_truth[field].append(float(t_val))
                row_errors[field] = abs(float(p_val) - float(t_val))
        per_example_errors.append(row_errors)

    # Build per-field report
    field_report: dict[str, dict[str, float]] = {}
    for field in _GLOBAL_FIELDS:
        preds = field_preds[field]
        truths = field_truth[field]
        if preds:
            field_report[field] = {
                "mae": mae(preds, truths),
                "r_squared": r_squared(preds, truths),
                "n": len(preds),
                "mean_pred": float(np.mean(preds)),
                "mean_truth": float(np.mean(truths)),
            }
        else:
            field_report[field] = {"mae": float("nan"), "r_squared": float("nan"), "n": 0}

    # Overall summary
    all_maes = [v["mae"] for v in field_report.values() if not math.isnan(v["mae"])]
    all_r2s = [v["r_squared"] for v in field_report.values() if not math.isnan(v["r_squared"])]

    report: dict[str, Any] = {
        "n_examples": n,
        "fields": field_report,
        "summary": {
            "mean_mae_across_fields": float(np.mean(all_maes)) if all_maes else float("nan"),
            "mean_r2_across_fields": float(np.mean(all_r2s)) if all_r2s else float("nan"),
        },
        "per_example_errors": per_example_errors,
    }
    return report
