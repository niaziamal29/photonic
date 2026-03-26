import * as ort from "onnxruntime-node";
import { encodeGraph, type PredictionOutput } from "@workspace/ml-models";
import { logger } from "./logger.js";

let session: ort.InferenceSession | null = null;
let modelVersion: string | null = null;

/**
 * Load an ONNX model for inference.
 * Supports hot-swap: call again with a new path to replace the active model.
 */
export async function loadModel(
  modelPath: string,
  version?: string,
): Promise<boolean> {
  try {
    const newSession = await ort.InferenceSession.create(modelPath, {
      executionProviders: ["cpu"],
    });
    // Warm-up: first inference is 10-100x slower due to JIT
    const warmupX = new ort.Tensor("float32", new Float32Array(29), [1, 29]);
    const warmupEdge = new ort.Tensor("int64", new BigInt64Array(0), [2, 0]);
    const warmupBatch = new ort.Tensor("int64", new BigInt64Array([0n]), [1]);
    await newSession.run({
      x: warmupX,
      edge_index: warmupEdge,
      batch: warmupBatch,
    });

    session = newSession;
    modelVersion = version ?? "unknown";
    logger.info(
      { modelPath, version: modelVersion },
      "ML model loaded and warmed up",
    );
    return true;
  } catch (err) {
    logger.error({ err, modelPath }, "Failed to load ML model");
    return false;
  }
}

export function isModelLoaded(): boolean {
  return session !== null;
}

export function getModelVersion(): string | null {
  return modelVersion;
}

/**
 * Run forward prediction on a circuit graph.
 * Falls back to null if model not loaded (caller should use physics engine).
 */
export async function predict(
  components: Array<{
    id: string;
    type: string;
    params: Record<string, any>;
  }>,
  connections: Array<{
    fromComponentId: string;
    fromPort: string;
    toComponentId: string;
    toPort: string;
  }>,
): Promise<PredictionOutput | null> {
  if (!session) return null;

  const start = performance.now();

  try {
    const encoded = encodeGraph(components, connections);
    const numNodes = encoded.nodeFeatures.length;

    if (numNodes === 0) return null;

    const numEdges = encoded.edgeIndex[0].length;

    // Create ONNX tensors
    const xData = new Float32Array(encoded.nodeFeatures.flat());
    const xTensor = new ort.Tensor("float32", xData, [numNodes, 29]);

    const edgeData = new BigInt64Array(numEdges * 2);
    for (let i = 0; i < numEdges; i++) {
      edgeData[i] = BigInt(encoded.edgeIndex[0][i]);
      edgeData[numEdges + i] = BigInt(encoded.edgeIndex[1][i]);
    }
    const edgeTensor = new ort.Tensor("int64", edgeData, [2, numEdges]);

    const batchData = new BigInt64Array(numNodes).fill(0n);
    const batchTensor = new ort.Tensor("int64", batchData, [numNodes]);

    // Run inference
    const results = await session.run({
      x: xTensor,
      edge_index: edgeTensor,
      batch: batchTensor,
    });

    const nodeData = results.node_predictions?.data as Float32Array;
    const globalData = results.global_predictions?.data as Float32Array;

    if (!nodeData || !globalData) return null;

    const latencyMs = performance.now() - start;
    const statusLabels: Array<"ok" | "warning" | "error"> = [
      "ok",
      "warning",
      "error",
    ];

    return {
      nodeOutputs: encoded.nodeIds.map((id: string, i: number) => ({
        componentId: id,
        outputPower: nodeData[i * 6],
        loss: nodeData[i * 6 + 1],
        phase: nodeData[i * 6 + 2],
        status:
          statusLabels[
            Math.round(
              Math.max(
                0,
                Math.min(
                  2,
                  // argmax of status logits (indices 3,4,5)
                  [
                    nodeData[i * 6 + 3],
                    nodeData[i * 6 + 4],
                    nodeData[i * 6 + 5],
                  ].indexOf(
                    Math.max(
                      nodeData[i * 6 + 3],
                      nodeData[i * 6 + 4],
                      nodeData[i * 6 + 5],
                    ),
                  ),
                ),
              ),
            )
          ] ?? "ok",
      })),
      globalOutputs: {
        equilibriumScore: globalData[0],
        systemLoss: globalData[1],
        totalOutputPower: globalData[2],
        snr: globalData[3],
      },
      latencyMs,
    };
  } catch (err) {
    logger.error({ err }, "ML inference failed");
    return null;
  }
}
