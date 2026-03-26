import { describe, it, expect } from 'vitest';
import {
  PORT_SPECS,
  ALL_PORT_NAMES,
  PORT_NAME_TO_INDEX,
  PORT_VOCAB_SIZE,
  COMPONENT_TYPES,
  COMPONENT_TYPE_TO_INDEX,
  NUM_COMPONENT_TYPES,
  getInputPorts,
  getOutputPorts,
  getOpticalPorts,
  hasPort,
  isConnectionValid,
  validateCircuitConnections,
  type ComponentType,
} from '../portSpec.js';

// ---------------------------------------------------------------------------
// Exhaustive coverage of all 15 component types
// ---------------------------------------------------------------------------

const EXPECTED_TYPES: ComponentType[] = [
  "laser_source",
  "waveguide",
  "beam_splitter",
  "coupler",
  "modulator",
  "photodetector",
  "optical_amplifier",
  "phase_shifter",
  "filter",
  "isolator",
  "circulator",
  "mzi",
  "ring_resonator",
  "grating_coupler",
  "mirror",
];

describe('PORT_SPECS coverage', () => {
  it('defines specs for exactly 15 component types', () => {
    expect(Object.keys(PORT_SPECS)).toHaveLength(15);
  });

  it.each(EXPECTED_TYPES)('has spec for %s', (type) => {
    expect(PORT_SPECS[type]).toBeDefined();
    expect(PORT_SPECS[type].ports.length).toBeGreaterThan(0);
  });

  it('every port has required fields', () => {
    for (const [type, spec] of Object.entries(PORT_SPECS)) {
      for (const port of spec.ports) {
        expect(port.name, `${type}.${port.name} missing name`).toBeTruthy();
        expect(['input', 'output', 'bidirectional']).toContain(port.direction);
        expect(['optical', 'electrical']).toContain(port.signal);
        expect(port.description, `${type}.${port.name} missing description`).toBeTruthy();
      }
    }
  });

  it('port names are unique within each component', () => {
    for (const [type, spec] of Object.entries(PORT_SPECS)) {
      const names = spec.ports.map((p) => p.name);
      const unique = new Set(names);
      expect(unique.size, `Duplicate ports on ${type}: ${names}`).toBe(names.length);
    }
  });
});

// ---------------------------------------------------------------------------
// Specific port topology checks
// ---------------------------------------------------------------------------

describe('port topology', () => {
  it('laser_source has no inputs', () => {
    expect(getInputPorts('laser_source')).toHaveLength(0);
  });

  it('laser_source has one optical output', () => {
    const outputs = getOutputPorts('laser_source');
    expect(outputs).toHaveLength(1);
    expect(outputs[0].name).toBe('out');
  });

  it('photodetector has one optical input and one electrical output', () => {
    const inputs = getInputPorts('photodetector');
    const outputs = getOutputPorts('photodetector');
    expect(inputs).toHaveLength(1);
    expect(inputs[0].signal).toBe('optical');
    expect(outputs).toHaveLength(1);
    expect(outputs[0].signal).toBe('electrical');
  });

  it('beam_splitter has 1 input and 2 outputs', () => {
    const inputs = getInputPorts('beam_splitter');
    const outputs = getOutputPorts('beam_splitter');
    expect(inputs).toHaveLength(1);
    expect(outputs).toHaveLength(2);
  });

  it('coupler (directional) has 2 inputs and 2 outputs', () => {
    const inputs = getInputPorts('coupler');
    const outputs = getOutputPorts('coupler');
    expect(inputs).toHaveLength(2);
    expect(outputs).toHaveLength(2);
  });

  it('circulator has 3 bidirectional ports', () => {
    const spec = PORT_SPECS['circulator'];
    expect(spec.ports).toHaveLength(3);
    for (const p of spec.ports) {
      expect(p.direction).toBe('bidirectional');
    }
  });

  it('mzi has 2 inputs and 2 outputs', () => {
    const inputs = getInputPorts('mzi');
    const outputs = getOutputPorts('mzi');
    expect(inputs).toHaveLength(2);
    expect(outputs).toHaveLength(2);
  });

  it('ring_resonator allows feedback', () => {
    expect(PORT_SPECS['ring_resonator'].allowsFeedback).toBe(true);
  });

  it('no other component allows feedback', () => {
    for (const [type, spec] of Object.entries(PORT_SPECS)) {
      if (type !== 'ring_resonator') {
        expect(spec.allowsFeedback, `${type} unexpectedly allows feedback`).toBe(false);
      }
    }
  });

  it('modulator has an electrical input', () => {
    const spec = PORT_SPECS['modulator'];
    const elec = spec.ports.filter((p) => p.signal === 'electrical');
    expect(elec).toHaveLength(1);
    expect(elec[0].direction).toBe('input');
  });

  it('grating_coupler has 2 bidirectional optical ports', () => {
    const spec = PORT_SPECS['grating_coupler'];
    expect(spec.ports).toHaveLength(2);
    for (const p of spec.ports) {
      expect(p.direction).toBe('bidirectional');
      expect(p.signal).toBe('optical');
    }
  });

  it('mirror has 1 input and 2 outputs', () => {
    const inputs = getInputPorts('mirror');
    const outputs = getOutputPorts('mirror');
    expect(inputs).toHaveLength(1);
    expect(outputs).toHaveLength(2);
    expect(outputs.map((p) => p.name).sort()).toEqual(['reflect', 'transmit']);
  });

  it('filter has drop port', () => {
    expect(hasPort('filter', 'drop')).toBe(true);
  });

  it('ring_resonator has through and drop ports', () => {
    expect(hasPort('ring_resonator', 'through')).toBe(true);
    expect(hasPort('ring_resonator', 'drop')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GNN encoding constants
// ---------------------------------------------------------------------------

describe('GNN encoding constants', () => {
  it('ALL_PORT_NAMES has no duplicates', () => {
    const unique = new Set(ALL_PORT_NAMES);
    expect(unique.size).toBe(ALL_PORT_NAMES.length);
  });

  it('ALL_PORT_NAMES is sorted', () => {
    const sorted = [...ALL_PORT_NAMES].sort();
    expect(ALL_PORT_NAMES).toEqual(sorted);
  });

  it('PORT_NAME_TO_INDEX maps every port name to a unique index', () => {
    const indices = new Set(PORT_NAME_TO_INDEX.values());
    expect(indices.size).toBe(PORT_VOCAB_SIZE);
    for (const name of ALL_PORT_NAMES) {
      expect(PORT_NAME_TO_INDEX.has(name)).toBe(true);
    }
  });

  it('PORT_VOCAB_SIZE matches ALL_PORT_NAMES length', () => {
    expect(PORT_VOCAB_SIZE).toBe(ALL_PORT_NAMES.length);
  });

  it('COMPONENT_TYPES has 15 entries', () => {
    expect(COMPONENT_TYPES).toHaveLength(15);
    expect(NUM_COMPONENT_TYPES).toBe(15);
  });

  it('COMPONENT_TYPE_TO_INDEX maps every type to a unique index', () => {
    const indices = new Set(COMPONENT_TYPE_TO_INDEX.values());
    expect(indices.size).toBe(15);
    for (const t of COMPONENT_TYPES) {
      expect(COMPONENT_TYPE_TO_INDEX.has(t)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Connection validation
// ---------------------------------------------------------------------------

describe('isConnectionValid', () => {
  it('allows laser_source.out → waveguide.in', () => {
    const r = isConnectionValid('laser_source', 'out', 'waveguide', 'in');
    expect(r.valid).toBe(true);
  });

  it('allows waveguide.out → beam_splitter.in', () => {
    const r = isConnectionValid('waveguide', 'out', 'beam_splitter', 'in');
    expect(r.valid).toBe(true);
  });

  it('allows beam_splitter.out_1 → photodetector.in', () => {
    const r = isConnectionValid('beam_splitter', 'out_1', 'photodetector', 'in');
    expect(r.valid).toBe(true);
  });

  it('rejects input port as source', () => {
    const r = isConnectionValid('waveguide', 'in', 'photodetector', 'in');
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('input-only');
  });

  it('rejects output port as target', () => {
    const r = isConnectionValid('laser_source', 'out', 'waveguide', 'out');
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('output-only');
  });

  it('rejects nonexistent source port', () => {
    const r = isConnectionValid('laser_source', 'banana', 'waveguide', 'in');
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('does not exist');
  });

  it('rejects nonexistent target port', () => {
    const r = isConnectionValid('laser_source', 'out', 'waveguide', 'banana');
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('does not exist');
  });

  it('rejects electrical-to-electrical connections', () => {
    // Hypothetical: if someone tried to connect detector electrical to modulator electrical
    const r = isConnectionValid('photodetector', 'electrical', 'modulator', 'electrical');
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('electrical');
  });

  it('allows bidirectional circulator ports', () => {
    const r = isConnectionValid('circulator', 'port_1', 'circulator', 'port_2');
    expect(r.valid).toBe(true);
  });

  it('allows grating_coupler bidirectional to waveguide', () => {
    const r = isConnectionValid('grating_coupler', 'waveguide', 'waveguide', 'in');
    expect(r.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Bulk circuit validation
// ---------------------------------------------------------------------------

describe('validateCircuitConnections', () => {
  it('returns empty array for valid circuit', () => {
    const components = [
      { id: 'l1', type: 'laser_source' as ComponentType },
      { id: 'w1', type: 'waveguide' as ComponentType },
      { id: 'd1', type: 'photodetector' as ComponentType },
    ];
    const connections = [
      { id: 'c1', fromComponentId: 'l1', fromPort: 'out', toComponentId: 'w1', toPort: 'in' },
      { id: 'c2', fromComponentId: 'w1', fromPort: 'out', toComponentId: 'd1', toPort: 'in' },
    ];
    expect(validateCircuitConnections(components, connections)).toEqual([]);
  });

  it('catches missing component references', () => {
    const components = [{ id: 'l1', type: 'laser_source' as ComponentType }];
    const connections = [
      { id: 'c1', fromComponentId: 'l1', fromPort: 'out', toComponentId: 'missing', toPort: 'in' },
    ];
    const errors = validateCircuitConnections(components, connections);
    expect(errors).toHaveLength(1);
    expect(errors[0].reason).toContain('not found');
  });

  it('catches invalid port on valid component', () => {
    const components = [
      { id: 'l1', type: 'laser_source' as ComponentType },
      { id: 'w1', type: 'waveguide' as ComponentType },
    ];
    const connections = [
      { id: 'c1', fromComponentId: 'l1', fromPort: 'out', toComponentId: 'w1', toPort: 'nonexistent' },
    ];
    const errors = validateCircuitConnections(components, connections);
    expect(errors).toHaveLength(1);
    expect(errors[0].reason).toContain('does not exist');
  });

  it('reports multiple errors', () => {
    const components = [
      { id: 'l1', type: 'laser_source' as ComponentType },
      { id: 'd1', type: 'photodetector' as ComponentType },
    ];
    const connections = [
      // laser input port used as source (laser has no input)
      { id: 'c1', fromComponentId: 'l1', fromPort: 'in', toComponentId: 'd1', toPort: 'in' },
      // missing component
      { id: 'c2', fromComponentId: 'ghost', fromPort: 'out', toComponentId: 'd1', toPort: 'in' },
    ];
    const errors = validateCircuitConnections(components, connections);
    expect(errors).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Utility function edge cases
// ---------------------------------------------------------------------------

describe('utility functions', () => {
  it('getOpticalPorts excludes electrical ports on modulator', () => {
    const optical = getOpticalPorts('modulator');
    expect(optical.every((p) => p.signal === 'optical')).toBe(true);
    expect(optical).toHaveLength(2); // in + out
  });

  it('getOpticalPorts excludes electrical ports on photodetector', () => {
    const optical = getOpticalPorts('photodetector');
    expect(optical).toHaveLength(1); // just "in"
    expect(optical[0].name).toBe('in');
  });

  it('hasPort returns false for wrong type', () => {
    expect(hasPort('laser_source', 'in')).toBe(false);
    expect(hasPort('photodetector', 'out')).toBe(false);
  });
});
