import * as ort from "onnxruntime-node";
import {
  EDGE_FEATURE_DIM,
  NODE_FEATURE_DIM,
  encodeGraph,
  type PredictionOutput,
} from "@workspace/ml-models";
import { logger } from "./logger.js";

let session: ort.InferenceSession | null = null;
let modelVersion: string | null = null;
type ModelIO = {
  nodeInputName: string;
  edgeIndexInputName: string;
  edgeFeaturesInputName: string;
  batchInputName: string;
  nodeOutputName: string;
  globalOutputName: string;
};
let modelIO: ModelIO | null = null;

function pickName(names: readonly string[], candidates: readonly string[]): string | null {
  for (const candidate of candidates) {
    if (names.includes(candidate)) return candidate;
  }
  return null;
}

function extractFixedTrailingDim(sessionLike: ort.InferenceSession, inputName: string): number | null {
  const meta = (sessionLike as any).inputMetadata?.[inputName];
  const dims = Array.isArray(meta?.dimensions) ? meta.dimensions : null;
  if (!dims || dims.length === 0) return null;
  const trailing = dims[dims.length - 1];
  return typeof trailing === "number" ? trailing : null;
}

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

    const nodeInputName = pickName(newSession.inputNames, ["node_features", "x"]);
    const edgeIndexInputName = pickName(newSession.inputNames, ["edge_index"]);
    const edgeFeaturesInputName = pickName(newSession.inputNames, ["edge_features", "edge_attr"]);
    const batchInputName = pickName(newSession.inputNames, ["batch"]);

    const nodeOutputName = pickName(newSession.outputNames, ["node_outputs", "node_predictions"]);
    const globalOutputName = pickName(newSession.outputNames, ["global_outputs", "global_predictions"]);

    if (!nodeInputName || !edgeIndexInputName || !edgeFeaturesInputName || !batchInputName) {
      throw new Error(
        `Model inputs are incompatible. Found inputs: [${newSession.inputNames.join(", ")}]. ` +
          "Expected node_features/x, edge_index, edge_features/edge_attr, and batch.",
      );
    }
    if (!nodeOutputName || !globalOutputName) {
      throw new Error(
        `Model outputs are incompatible. Found outputs: [${newSession.outputNames.join(", ")}]. ` +
          "Expected node_outputs/node_predictions and global_outputs/global_predictions.",
      );
    }

    const modelNodeDim = extractFixedTrailingDim(newSession, nodeInputName);
    if (modelNodeDim !== null && modelNodeDim !== NODE_FEATURE_DIM) {
      throw new Error(
        `Node feature dimension mismatch: model expects ${modelNodeDim}, encoder produces ${NODE_FEATURE_DIM}.`,
      );
    }
    const modelEdgeDim = extractFixedTrailingDim(newSession, edgeFeaturesInputName);
    if (modelEdgeDim !== null && modelEdgeDim !== EDGE_FEATURE_DIM) {
      throw new Error(
        `Edge feature dimension mismatch: model expects ${modelEdgeDim}, encoder produces ${EDGE_FEATURE_DIM}.`,
      );
    }

    const nextModelIO: ModelIO = {
      nodeInputName,
      edgeIndexInputName,
      edgeFeaturesInputName,
      batchInputName,
      nodeOutputName,
      globalOutputName,
    };

    // Warm-up: first inference is 10-100x slower due to JIT
    const warmupX = new ort.Tensor("float32", new Float32Array(NODE_FEATURE_DIM), [1, NODE_FEATURE_DIM]);
    const warmupEdge = new ort.Tensor("int64", new BigInt64Array(0), [2, 0]);
    const warmupEdgeFeatures = new ort.Tensor("float32", new Float32Array(0), [0, EDGE_FEATURE_DIM]);
    const warmupBatch = new ort.Tensor("int64", new BigInt64Array([0n]), [1]);
    await newSession.run(
      {
        [nextModelIO.nodeInputName]: warmupX,
        [nextModelIO.edgeIndexInputName]: warmupEdge,
        [nextModelIO.edgeFeaturesInputName]: warmupEdgeFeatures,
        [nextModelIO.batchInputName]: warmupBatch,
      } as Record<string, ort.Tensor>,
    );

    session = newSession;
    modelIO = nextModelIO;
    modelVersion = version ?? "unknown";
    logger.info(
      { modelPath, version: modelVersion, nodeDim: NODE_FEATURE_DIM, edgeDim: EDGE_FEATURE_DIM },
      "ML model loaded and warmed up",
    );
    return true;
  } catch (err) {
    logger.error({ err, modelPath }, "Failed to load ML model");
    return false;
  }
}

export function isModelLoaded(): boolean {
  return session !== null && modelIO !== null;
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
  if (!modelIO) return null;

  const start = performance.now();

  try {
    const encoded = encodeGraph(components, connections);
    const numNodes = encoded.nodeFeatures.length;

    if (numNodes === 0) return null;

    const numEdges = encoded.edgeIndex[0].length;

    // Create ONNX tensors
    const xData = new Float32Array(encoded.nodeFeatures.flat());
    const xTensor = new ort.Tensor("float32", xData, [numNodes, NODE_FEATURE_DIM]);

    const edgeData = new BigInt64Array(numEdges * 2);
    for (let i = 0; i < numEdges; i++) {
      edgeData[i] = BigInt(encoded.edgeIndex[0][i]);
      edgeData[numEdges + i] = BigInt(encoded.edgeIndex[1][i]);
    }
    const edgeTensor = new ort.Tensor("int64", edgeData, [2, numEdges]);
    const edgeFeatureTensor = new ort.Tensor(
      "float32",
      new Float32Array(encoded.edgeFeatures.flat()),
      [numEdges, EDGE_FEATURE_DIM],
    );

    const batchData = new BigInt64Array(numNodes).fill(0n);
    const batchTensor = new ort.Tensor("int64", batchData, [numNodes]);

    // Run inference
    const results = await session.run(
      {
        [modelIO.nodeInputName]: xTensor,
        [modelIO.edgeIndexInputName]: edgeTensor,
        [modelIO.edgeFeaturesInputName]: edgeFeatureTensor,
        [modelIO.batchInputName]: batchTensor,
      } as Record<string, ort.Tensor>,
    );

    const nodeData = results[modelIO.nodeOutputName]?.data as Float32Array;
    const globalData = results[modelIO.globalOutputName]?.data as Float32Array;

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
