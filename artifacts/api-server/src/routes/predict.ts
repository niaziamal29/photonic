import { Router, type IRouter } from "express";
import { predict, isModelLoaded, getModelVersion } from "../lib/mlInference.js";
import { runPhotonicsSimulation } from "../lib/photonicsEngine.js";

const router: IRouter = Router();

/**
 * POST /predict
 * Run ML forward prediction on a circuit graph.
 * Falls back to physics engine if ML model not loaded.
 */
router.post("/", async (req, res) => {
  try {
    const { components, connections } = req.body;
    if (!components || !Array.isArray(components)) {
      res.status(400).json({ error: "VALIDATION_ERROR", message: "components array is required" });
      return;
    }
    if (!connections || !Array.isArray(connections)) {
      res.status(400).json({ error: "VALIDATION_ERROR", message: "connections array is required" });
      return;
    }

    // Try ML prediction first
    if (isModelLoaded()) {
      const mlResult = await predict(components, connections);
      if (mlResult) {
        res.json({ source: "ml", modelVersion: getModelVersion(), ...mlResult });
        return;
      }
    }

    // Fallback: use physics engine
    const targetWavelength = req.body.targetWavelength ?? 1550;
    const layout = { components, connections };
    const physicsResult = runPhotonicsSimulation(layout, targetWavelength);

    res.json({
      source: "physics",
      nodeOutputs: physicsResult.componentResults.map(cr => ({
        componentId: cr.componentId,
        outputPower: cr.outputPower,
        loss: cr.loss,
        phase: cr.phase,
        status: cr.status,
      })),
      globalOutputs: {
        equilibriumScore: physicsResult.equilibriumScore,
        systemLoss: physicsResult.systemLoss,
        totalOutputPower: physicsResult.totalOutputPower,
        snr: physicsResult.snr,
        coherenceLength: physicsResult.coherenceLength,
      },
      latencyMs: 0,
    });
  } catch (err) {
    req.log.error({ err }, "Prediction failed");
    res.status(500).json({ error: "PREDICTION_ERROR", message: "Failed to run prediction" });
  }
});

/**
 * GET /predict/status
 * Check if ML model is loaded and get version info.
 */
router.get("/status", (req, res) => {
  res.json({
    modelLoaded: isModelLoaded(),
    modelVersion: getModelVersion(),
  });
});

export default router;
