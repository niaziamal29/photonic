"""Collect user-verified simulation results for active learning."""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from .quality_gates import validate_example, compute_quality_score

logger = logging.getLogger(__name__)


class ActiveLearningCollector:
    """Collects and validates training examples from user interactions."""

    def __init__(self, output_dir: str = "data/active_learning"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.accepted = 0
        self.rejected = 0

    def submit(
        self,
        graph: dict,
        ml_prediction: dict,
        physics_result: dict,
        source: str = "user_verified",
    ) -> Optional[dict]:
        """Submit a verified example for potential inclusion in training data.

        Args:
            graph: Circuit graph (nodes + edges)
            ml_prediction: What the ML model predicted
            physics_result: What the physics engine computed (ground truth)
            source: Origin of the example

        Returns:
            The accepted training example, or None if rejected by quality gates.
        """
        example = {
            "graph": graph,
            "results": {
                "perNode": physics_result.get("componentResults", []),
                "global": {
                    "equilibriumScore": physics_result.get("equilibriumScore", 0),
                    "totalSystemLoss_dB": physics_result.get("systemLoss", 0),
                    "coherenceLength_mm": physics_result.get("coherenceLength", 0),
                    "converged": physics_result.get("converged", False),
                    "issues": physics_result.get("issues", []),
                },
            },
            "meta": {
                "topology": "user_designed",
                "componentCount": len(graph.get("nodes", [])),
                "source": source,
                "generatedAt": datetime.now(timezone.utc).isoformat(),
                "mlDivergence": self._compute_divergence(ml_prediction, physics_result),
            },
        }

        # Quality gate check
        passed, failures = validate_example(example)
        if not passed:
            logger.warning(f"Example rejected by quality gates: {failures}")
            self.rejected += 1
            return None

        # Compute quality score
        example["meta"]["qualityScore"] = compute_quality_score(example)

        # Append to JSONL file
        date_str = datetime.now().strftime("%Y-%m-%d")
        output_file = self.output_dir / f"verified_{date_str}.jsonl"
        with open(output_file, "a") as f:
            f.write(json.dumps(example) + "\n")

        self.accepted += 1
        logger.info(f"Example accepted (quality={example['meta']['qualityScore']:.2f}). "
                     f"Total: {self.accepted} accepted, {self.rejected} rejected")
        return example

    def _compute_divergence(self, ml_pred: dict, physics_result: dict) -> float:
        """Compute divergence between ML prediction and physics engine."""
        ml_score = ml_pred.get("globalOutputs", {}).get("equilibriumScore", 0)
        phys_score = physics_result.get("equilibriumScore", 0)
        return abs(ml_score - phys_score)

    def get_stats(self) -> dict:
        return {
            "accepted": self.accepted,
            "rejected": self.rejected,
            "acceptance_rate": self.accepted / max(self.accepted + self.rejected, 1),
        }
