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

describe('graph power propagation', () => {
  it('laser 10 dBm → waveguide (2 dB/cm × 1cm) → detector receives 8 dBm', () => {
    const layout: CircuitLayout = {
      components: [
        { id: 'l', type: 'laser_source', label: 'L', x: 0, y: 0,
          params: { wavelength: 1550, power: 10, bandwidth: 0.1 } },
        { id: 'w', type: 'waveguide', label: 'W', x: 100, y: 0,
          params: { alpha: 2.0, length: 10000, neff: 2.4 } },
        { id: 'd', type: 'photodetector', label: 'D', x: 200, y: 0,
          params: { responsivity: 0.8 } },
      ],
      connections: [
        { id: 'e1', fromComponentId: 'l', fromPort: 'out', toComponentId: 'w', toPort: 'in' },
        { id: 'e2', fromComponentId: 'w', fromPort: 'out', toComponentId: 'd', toPort: 'in' },
      ],
    };
    const result = runPhotonicsSimulation(layout, 1550);
    const wg = result.componentResults.find(r => r.componentId === 'w')!;
    expect(wg.inputPower).toBeCloseTo(10, 1);
    expect(wg.outputPower).toBeCloseTo(8, 1);
    const det = result.componentResults.find(r => r.componentId === 'd')!;
    expect(det.inputPower).toBeCloseTo(8, 1);
  });

  it('amplifier: 0 dBm + 10 dB gain - 1 dB loss = 9 dBm', () => {
    const layout: CircuitLayout = {
      components: [
        { id: 'l', type: 'laser_source', label: 'L', x: 0, y: 0,
          params: { power: 0, wavelength: 1550, bandwidth: 0.1 } },
        { id: 'a', type: 'optical_amplifier', label: 'A', x: 100, y: 0,
          params: { gain: 10, loss: 1 } },
        { id: 'd', type: 'photodetector', label: 'D', x: 200, y: 0,
          params: { responsivity: 0.8 } },
      ],
      connections: [
        { id: 'e1', fromComponentId: 'l', fromPort: 'out', toComponentId: 'a', toPort: 'in' },
        { id: 'e2', fromComponentId: 'a', fromPort: 'out', toComponentId: 'd', toPort: 'in' },
      ],
    };
    const result = runPhotonicsSimulation(layout, 1550);
    const amp = result.componentResults.find(r => r.componentId === 'a')!;
    expect(amp.inputPower).toBeCloseTo(0, 1);
    expect(amp.outputPower).toBeCloseTo(9, 1);
  });

  it('disconnected components get no-signal input', () => {
    const layout: CircuitLayout = {
      components: [
        { id: 'l', type: 'laser_source', label: 'L', x: 0, y: 0,
          params: { power: 10, wavelength: 1550, bandwidth: 0.1 } },
        { id: 'w', type: 'waveguide', label: 'Floating', x: 200, y: 200,
          params: { alpha: 2, length: 1000 } },
      ],
      connections: [],
    };
    const result = runPhotonicsSimulation(layout, 1550);
    const wg = result.componentResults.find(r => r.componentId === 'w')!;
    expect(wg.inputPower).toBeLessThan(-50);
  });
});

describe('cycle handling', () => {
  it('ring resonator feedback loop emits FEEDBACK_LOOP warning', () => {
    const layout: CircuitLayout = {
      components: [
        { id: 'l', type: 'laser_source', label: 'L', x: 0, y: 0,
          params: { power: 10, wavelength: 1550, bandwidth: 0.1 } },
        { id: 'r', type: 'ring_resonator', label: 'Ring', x: 100, y: 0,
          params: { couplingCoeff: 0.1, loss: 3 } },
        { id: 'w', type: 'waveguide', label: 'Feedback', x: 100, y: 100,
          params: { alpha: 1, length: 500 } },
        { id: 'd', type: 'photodetector', label: 'D', x: 200, y: 0,
          params: { responsivity: 0.8 } },
      ],
      connections: [
        { id: 'e1', fromComponentId: 'l', fromPort: 'out', toComponentId: 'r', toPort: 'in' },
        { id: 'e2', fromComponentId: 'r', fromPort: 'through', toComponentId: 'd', toPort: 'in' },
        { id: 'e3', fromComponentId: 'r', fromPort: 'drop', toComponentId: 'w', toPort: 'in' },
        { id: 'e4', fromComponentId: 'w', fromPort: 'out', toComponentId: 'r', toPort: 'in' },
      ],
    };
    const result = runPhotonicsSimulation(layout, 1550);
    expect(result.issues.some(i => i.code === 'FEEDBACK_LOOP')).toBe(true);
    expect(result.converged).toBe(false);
  });
});
