import { pgTable, serial, text, integer, doublePrecision, jsonb, timestamp, pgEnum, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const buildStatusEnum = pgEnum("build_status", ["draft", "simulating", "converged", "needs_revision"]);

export const buildsTable = pgTable("builds", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  targetWavelength: doublePrecision("target_wavelength").notNull().default(1550),
  targetPower: doublePrecision("target_power"),
  targetSNR: doublePrecision("target_snr"),
  layout: jsonb("layout").notNull().$type<{
    components: Array<{
      id: string;
      type: string;
      label: string;
      x: number;
      y: number;
      params: Record<string, number | undefined>;
    }>;
    connections: Array<{
      id: string;
      fromComponentId: string;
      fromPort: string;
      toComponentId: string;
      toPort: string;
    }>;
  }>(),
  iterationCount: integer("iteration_count").notNull().default(0),
  status: buildStatusEnum("status").notNull().default("draft"),
  equilibriumScore: doublePrecision("equilibrium_score").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const simulationsTable = pgTable("simulations", {
  id: serial("id").primaryKey(),
  buildId: integer("build_id").notNull().references(() => buildsTable.id, { onDelete: "cascade" }),
  iterationNumber: integer("iteration_number").notNull(),
  totalInputPower: doublePrecision("total_input_power").notNull(),
  totalOutputPower: doublePrecision("total_output_power").notNull(),
  systemLoss: doublePrecision("system_loss").notNull(),
  snr: doublePrecision("snr").notNull(),
  coherenceLength: doublePrecision("coherence_length").notNull(),
  wavelength: doublePrecision("wavelength").notNull(),
  equilibriumScore: doublePrecision("equilibrium_score").notNull(),
  componentResults: jsonb("component_results").notNull().$type<Array<{
    componentId: string;
    label: string;
    type: string;
    inputPower: number;
    outputPower: number;
    phase: number;
    wavelength: number;
    loss: number;
    gain: number;
    status: "ok" | "warning" | "error";
    issues: Array<{ code: string; severity: string; message: string; suggestion: string; componentId?: string }>;
  }>>(),
  issues: jsonb("issues").notNull().$type<Array<{
    code: string;
    severity: string;
    message: string;
    suggestion: string;
    componentId?: string;
  }>>(),
  converged: boolean("converged").notNull().default(false),
  suggestions: jsonb("suggestions").notNull().$type<string[]>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertBuildSchema = createInsertSchema(buildsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSimulationSchema = createInsertSchema(simulationsTable).omit({ id: true, createdAt: true });

export type Build = typeof buildsTable.$inferSelect;
export type InsertBuild = z.infer<typeof insertBuildSchema>;
export type Simulation = typeof simulationsTable.$inferSelect;
export type InsertSimulation = z.infer<typeof insertSimulationSchema>;

export const trainingExamplesTable = pgTable("training_examples", {
  id: serial("id").primaryKey(),
  graph: jsonb("graph").notNull(),
  results: jsonb("results").notNull(),
  topology: text("topology").notNull(),
  componentCount: integer("component_count").notNull(),
  source: text("source").notNull().default("synthetic"),
  qualityScore: doublePrecision("quality_score"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const mlModelsTable = pgTable("ml_models", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  version: text("version").notNull(),
  modelType: text("model_type").notNull(),
  onnxPath: text("onnx_path"),
  pythonModule: text("python_module"),
  metrics: jsonb("metrics").notNull().$type<Record<string, number>>(),
  active: boolean("active").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTrainingExampleSchema = createInsertSchema(trainingExamplesTable).omit({ id: true, createdAt: true });
export const insertMlModelSchema = createInsertSchema(mlModelsTable).omit({ id: true, createdAt: true });

export type TrainingExample = typeof trainingExamplesTable.$inferSelect;
export type InsertTrainingExample = z.infer<typeof insertTrainingExampleSchema>;
export type MlModel = typeof mlModelsTable.$inferSelect;
export type InsertMlModel = z.infer<typeof insertMlModelSchema>;
