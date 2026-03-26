import { Router, type IRouter } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { db, buildsTable, simulationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { runPhotonicsSimulation } from "../lib/photonicsEngine.js";
import { validateBody } from "../middleware/validate.js";
import { parseBuildIdParam } from "./buildId.js";

const router: IRouter = Router();

// ---------- Zod schemas ----------

const createBuildSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  targetWavelength: z.number().min(400).max(2000).default(1550),
  targetPower: z.number().min(-40).max(30).optional(),
  targetSNR: z.number().min(0).max(100).optional(),
  layout: z.object({
    components: z
      .array(
        z.object({
          id: z.string(),
          type: z.string(),
          label: z.string(),
          x: z.number(),
          y: z.number(),
          params: z.record(z.number().optional()),
        }),
      )
      .max(200),
    connections: z
      .array(
        z.object({
          id: z.string(),
          fromComponentId: z.string(),
          fromPort: z.string(),
          toComponentId: z.string(),
          toPort: z.string(),
        }),
      )
      .max(500),
  }),
});

// ---------- Rate limiters ----------

const simulationLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

// ---------- Routes ----------

router.get("/", async (req, res) => {
  try {
    const builds = await db.select().from(buildsTable).orderBy(buildsTable.updatedAt);
    res.json(builds);
  } catch (err) {
    req.log.error({ err }, "Failed to list builds");
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to list builds" });
  }
});

router.post("/", validateBody(createBuildSchema), async (req, res) => {
  try {
    const { name, description, targetWavelength, targetPower, targetSNR, layout } = req.body;
    const [build] = await db.insert(buildsTable).values({
      name,
      description,
      targetWavelength: targetWavelength ?? 1550,
      targetPower,
      targetSNR,
      layout,
      iterationCount: 0,
      status: "draft",
      equilibriumScore: 0,
    }).returning();
    res.status(201).json(build);
  } catch (err) {
    req.log.error({ err }, "Failed to create build");
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to create build" });
  }
});

router.get("/:buildId", async (req, res) => {
  try {
    const buildId = parseBuildIdParam(req.params.buildId);
    if (buildId === null) {
      res.status(400).json({ error: "INVALID_ID", message: "Build ID must be a number" });
      return;
    }
    const [build] = await db.select().from(buildsTable).where(eq(buildsTable.id, buildId));
    if (!build) {
      res.status(404).json({ error: "NOT_FOUND", message: `Build ${buildId} not found` });
      return;
    }
    res.json(build);
  } catch (err) {
    req.log.error({ err }, "Failed to get build");
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to get build" });
  }
});

router.put("/:buildId", validateBody(createBuildSchema.partial()), async (req, res) => {
  try {
    const buildId = parseBuildIdParam(req.params.buildId);
    if (buildId === null) {
      res.status(400).json({ error: "INVALID_ID", message: "Build ID must be a number" });
      return;
    }
    const { name, description, targetWavelength, targetPower, targetSNR, layout } = req.body;
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (targetWavelength !== undefined) updateData.targetWavelength = targetWavelength;
    if (targetPower !== undefined) updateData.targetPower = targetPower;
    if (targetSNR !== undefined) updateData.targetSNR = targetSNR;
    if (layout !== undefined) updateData.layout = layout;

    const [updated] = await db.update(buildsTable).set(updateData).where(eq(buildsTable.id, buildId)).returning();
    if (!updated) {
      res.status(404).json({ error: "NOT_FOUND", message: `Build ${buildId} not found` });
      return;
    }
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update build");
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to update build" });
  }
});

router.delete("/:buildId", async (req, res) => {
  try {
    const buildId = parseBuildIdParam(req.params.buildId);
    if (buildId === null) {
      res.status(400).json({ error: "INVALID_ID", message: "Build ID must be a number" });
      return;
    }
    const result = await db.delete(buildsTable).where(eq(buildsTable.id, buildId)).returning();
    if (result.length === 0) {
      res.status(404).json({ error: "NOT_FOUND", message: `Build ${buildId} not found` });
      return;
    }
    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "Failed to delete build");
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to delete build" });
  }
});

router.post("/:buildId/simulate", simulationLimiter, async (req, res) => {
  try {
    const buildId = parseBuildIdParam(req.params.buildId);
    if (buildId === null) {
      res.status(400).json({ error: "INVALID_ID", message: "Build ID must be a number" });
      return;
    }
    const [build] = await db.select().from(buildsTable).where(eq(buildsTable.id, buildId));
    if (!build) {
      res.status(404).json({ error: "NOT_FOUND", message: `Build ${buildId} not found` });
      return;
    }

    const previousSims = await db.select().from(simulationsTable)
      .where(eq(simulationsTable.buildId, buildId))
      .orderBy(simulationsTable.iterationNumber);
    const previousScore = previousSims.length > 0 ? previousSims[previousSims.length - 1].equilibriumScore : undefined;

    const layout = build.layout as Parameters<typeof runPhotonicsSimulation>[0];
    const simOutput = runPhotonicsSimulation(layout, build.targetWavelength, previousScore);

    const iterationNumber = build.iterationCount + 1;
    const [sim] = await db.insert(simulationsTable).values({
      buildId,
      iterationNumber,
      totalInputPower: simOutput.totalInputPower,
      totalOutputPower: simOutput.totalOutputPower,
      systemLoss: simOutput.systemLoss,
      snr: simOutput.snr,
      coherenceLength: simOutput.coherenceLength,
      wavelength: simOutput.wavelength,
      equilibriumScore: simOutput.equilibriumScore,
      componentResults: simOutput.componentResults,
      issues: simOutput.issues,
      converged: simOutput.converged,
      suggestions: simOutput.suggestions,
    }).returning();

    await db.update(buildsTable).set({
      iterationCount: iterationNumber,
      equilibriumScore: simOutput.equilibriumScore,
      status: simOutput.converged ? "converged" : simOutput.equilibriumScore < 40 ? "needs_revision" : "draft",
      updatedAt: new Date(),
    }).where(eq(buildsTable.id, buildId));

    res.json({
      ...sim,
      converged: sim.converged,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to run simulation");
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to run simulation" });
  }
});

router.get("/:buildId/simulations", async (req, res) => {
  try {
    const buildId = parseBuildIdParam(req.params.buildId);
    if (buildId === null) {
      res.status(400).json({ error: "INVALID_ID", message: "Build ID must be a number" });
      return;
    }
    const sims = await db.select().from(simulationsTable)
      .where(eq(simulationsTable.buildId, buildId))
      .orderBy(simulationsTable.iterationNumber);
    res.json(sims);
  } catch (err) {
    req.log.error({ err }, "Failed to list simulations");
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to list simulations" });
  }
});

export default router;
