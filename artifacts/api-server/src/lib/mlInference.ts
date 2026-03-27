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
let modelContract: ModelContract | null = null;

function pickName(names: readonly string[], candidates: readonly string[]): string | null {
  for (const candidate of candidates) {
    if (names.includes(candidate)) return candidate;
  }
  return null;
}

interface ModelContract {
  nodeInputName: string;
  edgeIndexName: string;
  edgeFeatureName: string | null;
  batchInputName: string;
  nodeOutputName: string;
  globalOutputName: string;
  nodeFeatureDim: number;
  edgeFeatureDim: number;
}

function getTensorDim(
  sessionLike: ort.InferenceSession,
  inputName: string,
  axis: number,
  fallback: number,
): number {
  const metadata = (sessionLike as unknown as {
    inputMetadata?: Record<string, { shape?: unknown[]; dimensions?: unknown[] }>;
  }).inputMetadata?.[inputName];
  const dims = Array.isArray(metadata?.shape)
    ? metadata.shape
    : Array.isArray(metadata?.dimensions)
      ? metadata.dimensions
      : null;
  if (dims) {
    const dim = dims[axis];
    if (typeof dim === "number" && dim > 0) return dim;
  }
  return fallback;
}

function resolveModelContract(session: ort.InferenceSession): ModelContract {
  const nodeInputName = pickName(session.inputNames, ["node_features", "x"]);
  const edgeIndexName = pickName(session.inputNames, ["edge_index"]);
  const edgeFeatureName = pickName(session.inputNames, ["edge_features", "edge_attr"]);
  const batchInputName = pickName(session.inputNames, ["batch"]);
  const nodeOutputName = pickName(session.outputNames, ["node_outputs", "node_predictions"]);
  const globalOutputName = pickName(session.outputNames, ["global_outputs", "global_predictions"]);

  if (!nodeInputName || !edgeIndexName || !batchInputName) {
    throw new Error(
      `Model inputs are incompatible. Found inputs: [${session.inputNames.join(", ")}]. ` +
        "Expected node_features/x, edge_index, and batch.",
    );
  }
  if (!nodeOutputName || !globalOutputName) {
    throw new Error(
      `Model outputs are incompatible. Found outputs: [${session.outputNames.join(", ")}]. ` +
        "Expected node_outputs/node_predictions and global_outputs/global_predictions.",
    );
  }

  return {
    nodeInputName,
    edgeIndexName,
    edgeFeatureName,
    batchInputName,
    nodeOutputName,
    globalOutputName,
    nodeFeatureDim: getTensorDim(session, nodeInputName, 1, NODE_FEATURE_DIM),
    edgeFeatureDim: edgeFeatureName
      ? getTensorDim(session, edgeFeatureName, 1, EDGE_FEATURE_DIM)
      : 0,
  };
}

function flattenFeatureRows(rows: number[][], width: number): Float32Array {
  const data = new Float32Array(rows.length * width);
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex] ?? [];
    for (let colIndex = 0; colIndex < width; colIndex++) {
      data[rowIndex * width + colIndex] = row[colIndex] ?? 0;
    }
  }
  return data;
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
    const contract = resolveModelContract(newSession);

    if (contract.nodeFeatureDim !== NODE_FEATURE_DIM) {
      throw new Error(
        `Node feature dimension mismatch: model expects ${contract.nodeFeatureDim}, encoder produces ${NODE_FEATURE_DIM}.`,
      );
    }
    if (contract.edgeFeatureName && contract.edgeFeatureDim !== EDGE_FEATURE_DIM) {
      throw new Error(
        `Edge feature dimension mismatch: model expects ${contract.edgeFeatureDim}, encoder produces ${EDGE_FEATURE_DIM}.`,
      );
    }

    // Warm-up: first inference is 10-100x slower due to JIT
    const warmupFeeds: Record<string, ort.Tensor> = {
      [contract.nodeInputName]: new ort.Tensor(
        "float32",
        new Float32Array(contract.nodeFeatureDim),
        [1, contract.nodeFeatureDim],
      ),
      [contract.edgeIndexName]: new ort.Tensor(
        "int64",
        new BigInt64Array(0),
        [2, 0],
      ),
      [contract.batchInputName]: new ort.Tensor(
        "int64",
        new BigInt64Array([0n]),
        [1],
      ),
    };
    if (contract.edgeFeatureName) {
      warmupFeeds[contract.edgeFeatureName] = new ort.Tensor(
        "float32",
        new Float32Array(0),
        [0, contract.edgeFeatureDim],
      );
    }
    await newSession.run(warmupFeeds, [
      contract.nodeOutputName,
      contract.globalOutputName,
    ]);

    session = newSession;
    modelContract = contract;
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
  return session !== null && modelContract !== null;
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
  if (!modelContract) return null;

  const start = performance.now();

  try {
    const contract = modelContract;
    const encoded = encodeGraph(components, connections);
    const numNodes = encoded.nodeFeatures.length;

    if (numNodes === 0) return null;

    const numEdges = encoded.edgeIndex[0].length;

    // Create ONNX tensors
    const xData = flattenFeatureRows(encoded.nodeFeatures, contract.nodeFeatureDim);
    const xTensor = new ort.Tensor("float32", xData, [
      numNodes,
      contract.nodeFeatureDim,
    ]);

    const edgeData = new BigInt64Array(numEdges * 2);
    for (let i = 0; i < numEdges; i++) {
      edgeData[i] = BigInt(encoded.edgeIndex[0][i]);
      edgeData[numEdges + i] = BigInt(encoded.edgeIndex[1][i]);
    }
    const edgeTensor = new ort.Tensor("int64", edgeData, [2, numEdges]);

    const batchData = new BigInt64Array(numNodes).fill(0n);
    const batchTensor = new ort.Tensor("int64", batchData, [numNodes]);

    // Run inference
    const feeds: Record<string, ort.Tensor> = {
      [contract.nodeInputName]: xTensor,
      [contract.edgeIndexName]: edgeTensor,
      [contract.batchInputName]: batchTensor,
    };
    if (contract.edgeFeatureName) {
      const edgeFeatures = encoded.edgeFeatures ?? [];
      const edgeFeatureData = flattenFeatureRows(
        edgeFeatures,
        contract.edgeFeatureDim,
      );
      feeds[contract.edgeFeatureName] = new ort.Tensor(
        "float32",
        edgeFeatureData,
        [numEdges, contract.edgeFeatureDim],
      );
    }
    const results = await session.run(feeds, [
      contract.nodeOutputName,
      contract.globalOutputName,
    ]);

    const nodeData = results[contract.nodeOutputName]?.data as
      | Float32Array
      | undefined;
    const globalData = results[contract.globalOutputName]?.data as
      | Float32Array
      | undefined;

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
        coherenceLength: globalData[4] ?? null,
      },
      latencyMs,
    };
  } catch (err) {
    logger.error({ err }, "ML inference failed");
    return null;
  }
}
