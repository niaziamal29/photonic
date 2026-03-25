import { describe, it, expect } from 'vitest';
import { runPhotonicsSimulation, dBmToWatts, wattsToDBm, type CircuitLayout } from '../photonicsEngine.js';

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

describe('dBm/Watts correctness', () => {
  it('0 dBm = 1 mW round-trip', () => {
    expect(dBmToWatts(0)).toBeCloseTo(0.001, 6);
    expect(wattsToDBm(0.001)).toBeCloseTo(0, 3);
  });

  it('-30 dBm = 1 μW', () => {
    expect(dBmToWatts(-30)).toBeCloseTo(1e-6, 9);
  });

  it('20 dBm = 100 mW', () => {
    expect(dBmToWatts(20)).toBeCloseTo(0.1, 4);
  });

  it('wattsToDBm returns -100 for zero or negative watts', () => {
    expect(wattsToDBm(0)).toBe(-100);
    expect(wattsToDBm(-1)).toBe(-100);
  });
});

describe('edge cases', () => {
  it('laser-only circuit has equilibrium score > 0', () => {
    const layout: CircuitLayout = {
      components: [
        { id: 'l', type: 'laser_source', label: 'L', x: 0, y: 0, params: { power: 10, wavelength: 1550, bandwidth: 0.1 } },
      ],
      connections: [],
    };
    const result = runPhotonicsSimulation(layout, 1550);
    expect(result.equilibriumScore).toBeGreaterThan(0);
    expect(result.totalInputPower).toBeCloseTo(10, 1);
  });

  it('multi-source circuit combines power in watts', () => {
    const layout: CircuitLayout = {
      components: [
        { id: 'l1', type: 'laser_source', label: 'L1', x: 0, y: 0, params: { power: 10, wavelength: 1550, bandwidth: 0.1 } },
        { id: 'l2', type: 'laser_source', label: 'L2', x: 0, y: 100, params: { power: 10, wavelength: 1550, bandwidth: 0.1 } },
        { id: 'c', type: 'coupler', label: 'C', x: 100, y: 50, params: { couplingCoeff: 0.5, loss: 0.5 } },
        { id: 'd', type: 'photodetector', label: 'D', x: 200, y: 50, params: { responsivity: 0.8 } },
      ],
      connections: [
        { id: 'e1', fromComponentId: 'l1', fromPort: 'out', toComponentId: 'c', toPort: 'in' },
        { id: 'e2', fromComponentId: 'l2', fromPort: 'out', toComponentId: 'c', toPort: 'in' },
        { id: 'e3', fromComponentId: 'c', fromPort: 'out', toComponentId: 'd', toPort: 'in' },
      ],
    };
    const result = runPhotonicsSimulation(layout, 1550);
    const coupler = result.componentResults.find(r => r.componentId === 'c')!;
    // Two 10 dBm sources combined = 13.01 dBm (double the watts)
    expect(coupler.inputPower).toBeCloseTo(13.01, 0);
  });

  it('very long waveguide has high loss', () => {
    const layout: CircuitLayout = {
      components: [
        { id: 'l', type: 'laser_source', label: 'L', x: 0, y: 0, params: { power: 10, wavelength: 1550, bandwidth: 0.1 } },
        { id: 'w', type: 'waveguide', label: 'W', x: 100, y: 0, params: { alpha: 2.0, length: 100000, neff: 2.4 } }, // 10cm = 20 dB loss
        { id: 'd', type: 'photodetector', label: 'D', x: 200, y: 0, params: { responsivity: 0.8 } },
      ],
      connections: [
        { id: 'e1', fromComponentId: 'l', fromPort: 'out', toComponentId: 'w', toPort: 'in' },
        { id: 'e2', fromComponentId: 'w', fromPort: 'out', toComponentId: 'd', toPort: 'in' },
      ],
    };
    const result = runPhotonicsSimulation(layout, 1550);
    const wg = result.componentResults.find(r => r.componentId === 'w')!;
    expect(wg.loss).toBeCloseTo(20, 1); // 2 dB/cm * 10 cm
    expect(wg.outputPower).toBeCloseTo(-10, 1); // 10 - 20 = -10 dBm
  });

  it('amplifier overcomes waveguide loss', () => {
    const layout: CircuitLayout = {
      components: [
        { id: 'l', type: 'laser_source', label: 'L', x: 0, y: 0, params: { power: 0, wavelength: 1550, bandwidth: 0.1 } },
        { id: 'w', type: 'waveguide', label: 'W', x: 100, y: 0, params: { alpha: 2.0, length: 50000, neff: 2.4 } }, // 5cm = 10 dB loss
        { id: 'a', type: 'optical_amplifier', label: 'A', x: 200, y: 0, params: { gain: 20, loss: 1 } }, // 19 dB net gain
        { id: 'd', type: 'photodetector', label: 'D', x: 300, y: 0, params: { responsivity: 0.8 } },
      ],
      connections: [
        { id: 'e1', fromComponentId: 'l', fromPort: 'out', toComponentId: 'w', toPort: 'in' },
        { id: 'e2', fromComponentId: 'w', fromPort: 'out', toComponentId: 'a', toPort: 'in' },
        { id: 'e3', fromComponentId: 'a', fromPort: 'out', toComponentId: 'd', toPort: 'in' },
      ],
    };
    const result = runPhotonicsSimulation(layout, 1550);
    const amp = result.componentResults.find(r => r.componentId === 'a')!;
    expect(amp.inputPower).toBeCloseTo(-10, 1); // 0 - 10 = -10
    expect(amp.outputPower).toBeCloseTo(9, 1); // -10 + 20 - 1 = 9
  });
});
