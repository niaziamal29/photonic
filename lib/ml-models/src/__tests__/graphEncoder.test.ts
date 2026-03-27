import { describe, it, expect } from 'vitest';
import { encodeNodeFeatures, encodeGraph, NODE_FEATURE_DIM, EDGE_FEATURE_DIM, encodeEdgeFeatures } from '../graphEncoder.js';
import { NUM_COMPONENT_TYPES, PORT_VOCAB_SIZE } from '../portSpec.js';
import { NUM_PARAMS } from '../paramNormalization.js';

describe('encodeNodeFeatures', () => {
  it('returns correct dimension vector', () => {
    const features = encodeNodeFeatures('laser_source', { wavelength: 1550, power: 10 });
    expect(features).toHaveLength(NODE_FEATURE_DIM);
    expect(features).toHaveLength(NUM_COMPONENT_TYPES + NUM_PARAMS);
  });

  it('one-hot type encoding has exactly one 1', () => {
    const features = encodeNodeFeatures('waveguide', {});
    const typeOneHot = features.slice(0, NUM_COMPONENT_TYPES);
    expect(typeOneHot.filter(v => v === 1)).toHaveLength(1);
    expect(typeOneHot.reduce((a, b) => a + b, 0)).toBe(1);
  });

  it('imputes defaults for missing params (not zeros)', () => {
    const features = encodeNodeFeatures('waveguide', {});
    // waveguide default alpha is 2.0, range [0, 20], so normalized = 2/20 = 0.1
    const alphaIdx = NUM_COMPONENT_TYPES + 7; // alpha is at index 7 in PARAM_NAMES
    expect(features[alphaIdx]).toBeCloseTo(0.1, 2);
  });

  it('normalizes params to [0, 1] range', () => {
    const features = encodeNodeFeatures('laser_source', { wavelength: 1550, power: 30 });
    // All values should be in [0, 1]
    for (const v of features) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('encodeEdgeFeatures', () => {
  it('returns correct dimension', () => {
    const features = encodeEdgeFeatures('out', 'in');
    expect(features).toHaveLength(EDGE_FEATURE_DIM);
    expect(EDGE_FEATURE_DIM).toBe(PORT_VOCAB_SIZE * 2);
    expect(EDGE_FEATURE_DIM).toBe(34);
  });
});

describe('encodeGraph', () => {
  it('encodes a simple laser→detector circuit', () => {
    const graph = encodeGraph(
      [
        { id: 'l', type: 'laser_source', params: { wavelength: 1550, power: 10 } },
        { id: 'd', type: 'photodetector', params: { responsivity: 0.8 } },
      ],
      [{ fromComponentId: 'l', fromPort: 'out', toComponentId: 'd', toPort: 'in' }],
    );
    expect(graph.nodeFeatures).toHaveLength(2);
    expect(graph.edgeIndex[0]).toHaveLength(1);
    expect(graph.edgeIndex[1]).toHaveLength(1);
    expect(graph.nodeIds).toEqual(['l', 'd']);
  });
});
