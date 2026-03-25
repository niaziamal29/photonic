import { describe, it, expect } from 'vitest';
import { runPhotonicsSimulation, type CircuitLayout } from '../photonicsEngine.js';

describe('photonicsEngine', () => {
  it('returns empty circuit error for no components', () => {
    const layout: CircuitLayout = { components: [], connections: [] };
    const result = runPhotonicsSimulation(layout, 1550);
    expect(result.issues[0].code).toBe('EMPTY_CIRCUIT');
    expect(result.equilibriumScore).toBe(0);
  });
});
