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

describe('coherence length', () => {
  it('L_c = c/Δν: 0.1 GHz bandwidth → 3000 mm', () => {
    const layout: CircuitLayout = {
      components: [
        { id: 'l', type: 'laser_source', label: 'L', x: 0, y: 0,
          params: { wavelength: 1550, power: 0, bandwidth: 0.1 } },
        { id: 'd', type: 'photodetector', label: 'D', x: 100, y: 0,
          params: { responsivity: 0.8 } },
      ],
      connections: [
        { id: 'e', fromComponentId: 'l', fromPort: 'out', toComponentId: 'd', toPort: 'in' },
      ],
    };
    const result = runPhotonicsSimulation(layout, 1550);
    expect(result.coherenceLength).toBeCloseTo(3000, 0);
  });

  it('L_c = c/Δν: 10 GHz bandwidth → 30 mm', () => {
    const layout: CircuitLayout = {
      components: [
        { id: 'l', type: 'laser_source', label: 'L', x: 0, y: 0,
          params: { wavelength: 1550, power: 0, bandwidth: 10 } },
      ],
      connections: [],
    };
    const result = runPhotonicsSimulation(layout, 1550);
    expect(result.coherenceLength).toBeCloseTo(30, 0);
  });
});
