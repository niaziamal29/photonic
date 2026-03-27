import { COMPONENT_TYPE_TO_INDEX, NUM_COMPONENT_TYPES, PORT_NAME_TO_INDEX, PORT_VOCAB_SIZE } from './portSpec.js';
import { normalizeParam, imputeDefault, PARAM_NAMES, NUM_PARAMS } from './paramNormalization.js';
import type { GraphInput } from './types.js';

/** Total node feature dimension: one-hot type + normalized params */
export const NODE_FEATURE_DIM = NUM_COMPONENT_TYPES + NUM_PARAMS;

/** Total edge feature dimension: one-hot fromPort + one-hot toPort */
export const EDGE_FEATURE_DIM = PORT_VOCAB_SIZE * 2;
/** Edge feature schema: [one_hot(from_port, PORT_VOCAB_SIZE) || one_hot(to_port, PORT_VOCAB_SIZE)] */
export const EDGE_FEATURE_SCHEMA = "one_hot(from_port)||one_hot(to_port)" as const;

export function encodeNodeFeatures(
  type: string,
  params: Record<string, number | undefined>,
): number[] {
  // One-hot type encoding
  const typeVec = new Array(NUM_COMPONENT_TYPES).fill(0);
  const typeIdx = COMPONENT_TYPE_TO_INDEX.get(type as any);
  if (typeIdx !== undefined) typeVec[typeIdx] = 1;

  // Normalized params with default imputation
  const paramVec = PARAM_NAMES.map(name => {
    const raw = params[name] ?? imputeDefault(type, name);
    return normalizeParam(name, raw);
  });

  return [...typeVec, ...paramVec];
}

export function encodeEdgeFeatures(fromPort: string, toPort: string): number[] {
  const fromOneHot = new Array(PORT_VOCAB_SIZE).fill(0);
  const toOneHot = new Array(PORT_VOCAB_SIZE).fill(0);
  const fromIdx = PORT_NAME_TO_INDEX.get(fromPort);
  const toIdx = PORT_NAME_TO_INDEX.get(toPort);
  if (fromIdx !== undefined) fromOneHot[fromIdx] = 1;
  if (toIdx !== undefined) toOneHot[toIdx] = 1;
  return [...fromOneHot, ...toOneHot];
}

export function encodeGraph(
  components: { id: string; type: string; params: Record<string, any> }[],
  connections: { fromComponentId: string; fromPort: string; toComponentId: string; toPort: string }[],
): GraphInput {
  const nodeIdToIdx = new Map(components.map((c, i) => [c.id, i]));
  const nodeFeatures = components.map(c => encodeNodeFeatures(c.type, c.params));

  const srcIndices: number[] = [];
  const dstIndices: number[] = [];
  const edgeFeatures: number[][] = [];

  for (const conn of connections) {
    const srcIdx = nodeIdToIdx.get(conn.fromComponentId);
    const dstIdx = nodeIdToIdx.get(conn.toComponentId);
    if (srcIdx === undefined || dstIdx === undefined) continue;

    srcIndices.push(srcIdx);
    dstIndices.push(dstIdx);
    edgeFeatures.push(encodeEdgeFeatures(conn.fromPort, conn.toPort));
  }

  return {
    nodeFeatures,
    edgeIndex: [srcIndices, dstIndices],
    edgeFeatures,
    nodeIds: components.map(c => c.id),
  };
}
