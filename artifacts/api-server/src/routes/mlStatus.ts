import { Router, type IRouter } from "express";
import { isModelLoaded, getModelVersion } from "../lib/mlInference.js";
import { mlMetrics } from "../lib/mlMetrics.js";

const router: IRouter = Router();

router.get("/", (req, res) => {
  const summary = mlMetrics.getSummary();
  res.json({
    model: {
      loaded: isModelLoaded(),
      version: getModelVersion(),
    },
    metrics: summary,
  });
});

router.get("/metrics", (req, res) => {
  const windowMs = parseInt(req.query.window as string) || 3600000;
  res.json(mlMetrics.getSummary(windowMs));
});

router.get("/recent", (req, res) => {
  const n = Math.min(parseInt(req.query.n as string) || 100, 1000);
  res.json(mlMetrics.getRecentSamples(n));
});

export default router;
