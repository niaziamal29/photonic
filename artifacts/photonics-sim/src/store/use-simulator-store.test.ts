import { beforeEach, describe, expect, it } from 'vitest';
import { useSimulatorStore } from './use-simulator-store';

describe('useSimulatorStore onConnect edge IDs', () => {
  beforeEach(() => {
    useSimulatorStore.setState({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      activeBuildId: null,
      isSimulating: false,
      activeSimulationResult: null,
      activePanelTab: 'properties',
      mlPredictions: null,
      mlMode: 'physics',
      mlModelLoaded: false,
      mlModelVersion: null,
      mlLatencyMs: null,
    });
  });

  it('allows two edges between the same node pair when handles differ', () => {
    const { onConnect } = useSimulatorStore.getState();

    onConnect({ source: 'node-a', target: 'node-b', sourceHandle: 'out-1', targetHandle: 'in-1' });
    onConnect({ source: 'node-a', target: 'node-b', sourceHandle: 'out-2', targetHandle: 'in-1' });

    const edges = useSimulatorStore.getState().edges;

    expect(edges).toHaveLength(2);
    expect(edges[0].id).toBe('e-node-a-out-1-node-b-in-1');
    expect(edges[1].id).toBe('e-node-a-out-2-node-b-in-1');
    expect(edges.map((edge) => edge.id)).toEqual(expect.arrayContaining(['e-node-a-out-1-node-b-in-1', 'e-node-a-out-2-node-b-in-1']));
  });

  it('keeps a stable base ID and appends a monotonic suffix for repeated identical connections', () => {
    const { onConnect } = useSimulatorStore.getState();

    onConnect({ source: 'node-a', target: 'node-b', sourceHandle: 'out', targetHandle: 'in' });
    onConnect({ source: 'node-a', target: 'node-b', sourceHandle: 'out', targetHandle: 'in' });

    const edgeIds = useSimulatorStore.getState().edges.map((edge) => edge.id);
    expect(edgeIds).toEqual(['e-node-a-out-node-b-in', 'e-node-a-out-node-b-in-2']);
  });
});
