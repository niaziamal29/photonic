import { COMPONENT_TYPES, NUM_COMPONENT_TYPES } from './portSpec.js';
import { denormalizeParam, PARAM_NAMES } from './paramNormalization.js';
import type { GraphNode } from './types.js';

export function decodeNodeFeatures(features: number[], id: string): GraphNode {
  const typeScores = features.slice(0, NUM_COMPONENT_TYPES);
  const typeIdx = typeScores.indexOf(Math.max(...typeScores));
  const type = COMPONENT_TYPES[typeIdx] ?? 'waveguide';

  const params: Record<string, number> = {};
  PARAM_NAMES.forEach((name, i) => {
    const normalized = features[NUM_COMPONENT_TYPES + i] ?? 0;
    params[name] = denormalizeParam(name, normalized);
  });

  return { id, type, params };
}

/**
 * Convert generated graph to ReactFlow-compatible format for the frontend.
 */
export function graphToReactFlowFormat(
  nodes: GraphNode[],
  edges: { source: string; target: string; sourcePort: string; targetPort: string }[],
): {
  nodes: Array<{ id: string; type: string; position: { x: number; y: number }; data: any }>;
  edges: Array<{ id: string; source: string; target: string; animated: boolean }>;
} {
  return {
    nodes: nodes.map((n, i) => ({
      id: n.id,
      type: 'photonNode',
      position: { x: i * 200, y: Math.sin(i) * 100 + 200 },
      data: { label: `${n.type}_${i}`, type: n.type, params: n.params },
    })),
    edges: edges.map(e => ({
      id: `e-${e.source}-${e.target}`,
      source: e.source,
      target: e.target,
      animated: true,
    })),
  };
}
