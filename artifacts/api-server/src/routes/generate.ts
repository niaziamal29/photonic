import { Router, type IRouter } from "express";

const router: IRouter = Router();

/**
 * POST /generate
 * Generate novel circuit topologies from target specifications.
 * Placeholder — requires trained cVAE model (Task 15+).
 */
router.post("/", async (req, res) => {
  res.status(501).json({
    error: "NOT_IMPLEMENTED",
    message: "Inverse design is not yet available. The generative model (cVAE) needs to be trained first.",
    requiredFields: {
      targetWavelength: "number (nm)",
      targetPower: "number (dBm)",
      targetSNR: "number (dB)",
      maxComponents: "number",
      numCandidates: "number (1-10)",
    },
  });
});

export default router;
