import { Router, type IRouter } from "express";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

const SIDECAR_URL = process.env.GENERATION_SIDECAR_URL ?? "http://localhost:8100";

router.post("/", async (req, res) => {
  try {
    const sidecarResp = await fetch(`${SIDECAR_URL}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });

    if (sidecarResp.status === 503) {
      res.status(503).json({
        error: "MODEL_NOT_LOADED",
        message: "Generative model (cVAE) is not loaded on the sidecar. Train the model first.",
      });
      return;
    }

    if (!sidecarResp.ok) {
      const err = await sidecarResp.text();
      logger.error({ status: sidecarResp.status, err }, "Sidecar generation failed");
      res.status(502).json({ error: "SIDECAR_ERROR", message: "Generation sidecar returned an error" });
      return;
    }

    const data = await sidecarResp.json();
    res.json(data);
  } catch (err: any) {
    if (err.cause?.code === "ECONNREFUSED") {
      res.status(503).json({
        error: "SIDECAR_UNAVAILABLE",
        message: "Generation sidecar is not running. Start it with: python -m src.serve.app",
      });
      return;
    }
    logger.error({ err }, "Generation request failed");
    res.status(500).json({ error: "GENERATION_ERROR", message: "Failed to generate circuits" });
  }
});

router.get("/status", async (req, res) => {
  try {
    const resp = await fetch(`${SIDECAR_URL}/health`);
    const data = await resp.json();
    res.json(data);
  } catch {
    res.json({ status: "unavailable", modelLoaded: false });
  }
});

export default router;
