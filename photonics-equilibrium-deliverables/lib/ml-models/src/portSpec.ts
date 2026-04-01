/**
 * Formal port specification for all 15 photonic component types.
 *
 * This module is the single source of truth for:
 *  - Which ports exist on each component type
 *  - Port directions (input / output / bidirectional)
 *  - Connection validity between port pairs
 *  - GNN edge feature encoding (port name → index)
 *  - Circuit generator topology constraints
 *
 * Port naming convention:
 *  - "in"  / "in_N"   → optical input
 *  - "out" / "out_N"  → optical output
 *  - "drop"            → secondary output (filters, ring resonators)
 *  - "add"             → secondary input  (circulators, ring resonators)
 *  - "reflect"         → reflected output  (mirrors, grating couplers)
 *  - "through" / "cross" → directional coupler / MZI outputs
 *  - "monitor"         → tap output for monitoring
 *  - "electrical"      → electrical port (detectors, modulators)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PortDirection = "input" | "output" | "bidirectional";

export type SignalDomain = "optical" | "electrical";

export interface PortDef {
  /** Unique name within the component (used in Connection.fromPort / toPort) */
  name: string;
  direction: PortDirection;
  signal: SignalDomain;
  /** Human-readable description for UI tooltips */
  description: string;
}

export interface ComponentPortSpec {
  /** Ordered list of ports — order matters for GNN encoding */
  ports: PortDef[];
  /** Whether this component can participate in feedback loops */
  allowsFeedback: boolean;
}

/** Union of all 15 component type string literals */
export type ComponentType =
  | "laser_source"
  | "waveguide"
  | "beam_splitter"
  | "coupler"
  | "modulator"
  | "photodetector"
  | "optical_amplifier"
  | "phase_shifter"
  | "filter"
  | "isolator"
  | "circulator"
  | "mzi"
  | "ring_resonator"
  | "grating_coupler"
  | "mirror";

// ---------------------------------------------------------------------------
// Helpers for concise definitions
// ---------------------------------------------------------------------------

function optIn(name: string, description: string): PortDef {
  return { name, direction: "input", signal: "optical", description };
}

function optOut(name: string, description: string): PortDef {
  return { name, direction: "output", signal: "optical", description };
}

function optBidi(name: string, description: string): PortDef {
  return { name, direction: "bidirectional", signal: "optical", description };
}

function elecOut(name: string, description: string): PortDef {
  return { name, direction: "output", signal: "electrical", description };
}

function elecIn(name: string, description: string): PortDef {
  return { name, direction: "input", signal: "electrical", description };
}

// ---------------------------------------------------------------------------
// Port Specifications
// ---------------------------------------------------------------------------

export const PORT_SPECS: Record<ComponentType, ComponentPortSpec> = {
  // --- Sources ---
  laser_source: {
    ports: [
      optOut("out", "Laser output beam"),
    ],
    allowsFeedback: false,
  },

  // --- Passive waveguide ---
  waveguide: {
    ports: [
      optIn("in", "Waveguide input"),
      optOut("out", "Waveguide output"),
    ],
    allowsFeedback: false,
  },

  // --- Splitters & combiners ---
  beam_splitter: {
    ports: [
      optIn("in", "Input beam"),
      optOut("out_1", "First output (ratio × power)"),
      optOut("out_2", "Second output ((1 − ratio) × power)"),
    ],
    allowsFeedback: false,
  },

  coupler: {
    ports: [
      optIn("in_1", "Through-port input"),
      optIn("in_2", "Cross-port input"),
      optOut("through", "Through-port output"),
      optOut("cross", "Cross-coupled output"),
    ],
    allowsFeedback: false,
  },

  // --- Active components ---
  modulator: {
    ports: [
      optIn("in", "Optical input"),
      elecIn("electrical", "RF / electrical drive signal"),
      optOut("out", "Modulated optical output"),
    ],
    allowsFeedback: false,
  },

  photodetector: {
    ports: [
      optIn("in", "Optical input"),
      elecOut("electrical", "Photocurrent output"),
    ],
    allowsFeedback: false,
  },

  optical_amplifier: {
    ports: [
      optIn("in", "Signal input"),
      optOut("out", "Amplified output"),
    ],
    allowsFeedback: false,
  },

  // --- Phase / filtering ---
  phase_shifter: {
    ports: [
      optIn("in", "Optical input"),
      optOut("out", "Phase-shifted output"),
    ],
    allowsFeedback: false,
  },

  filter: {
    ports: [
      optIn("in", "Broadband input"),
      optOut("out", "Passband output"),
      optOut("drop", "Rejected / out-of-band output"),
    ],
    allowsFeedback: false,
  },

  // --- Non-reciprocal ---
  isolator: {
    ports: [
      optIn("in", "Forward-propagating input"),
      optOut("out", "Forward output (reverse-blocked)"),
    ],
    allowsFeedback: false,
  },

  circulator: {
    ports: [
      optBidi("port_1", "Port 1 — routes to port 2"),
      optBidi("port_2", "Port 2 — routes to port 3"),
      optBidi("port_3", "Port 3 — routes to port 1"),
    ],
    allowsFeedback: false,
  },

  // --- Interferometric ---
  mzi: {
    ports: [
      optIn("in_1", "Upper arm input"),
      optIn("in_2", "Lower arm input"),
      optOut("out_1", "Bar-state output"),
      optOut("out_2", "Cross-state output"),
    ],
    allowsFeedback: false,
  },

  // --- Resonant ---
  ring_resonator: {
    ports: [
      optIn("in", "Bus waveguide input"),
      optOut("through", "Through port (on-resonance dip)"),
      optOut("drop", "Drop port (on-resonance output)"),
    ],
    allowsFeedback: true, // ring is inherently a feedback structure
  },

  // --- Coupling ---
  grating_coupler: {
    ports: [
      optBidi("fiber", "Fiber / free-space side"),
      optBidi("waveguide", "On-chip waveguide side"),
    ],
    allowsFeedback: false,
  },

  // --- Reflective ---
  mirror: {
    ports: [
      optIn("in", "Incident beam"),
      optOut("reflect", "Reflected beam"),
      optOut("transmit", "Transmitted beam (1 − R)"),
    ],
    allowsFeedback: false,
  },
} as const;

// ---------------------------------------------------------------------------
// Derived constants for GNN encoding
// ---------------------------------------------------------------------------

/** Flat list of every unique port name across all component types */
export const ALL_PORT_NAMES: readonly string[] = (() => {
  const names = new Set<string>();
  for (const spec of Object.values(PORT_SPECS)) {
    for (const port of spec.ports) {
      names.add(port.name);
    }
  }
  return [...names].sort();
})();

/** Map from port name → integer index for edge feature encoding */
export const PORT_NAME_TO_INDEX: ReadonlyMap<string, number> = new Map(
  ALL_PORT_NAMES.map((name, i) => [name, i])
);

/** Total number of distinct port names (dimension of one-hot port encoding) */
export const PORT_VOCAB_SIZE = ALL_PORT_NAMES.length;

// ---------------------------------------------------------------------------
// Component type indexing (for GNN node features)
// ---------------------------------------------------------------------------

/** All component types in deterministic order */
export const COMPONENT_TYPES: readonly ComponentType[] = Object.keys(PORT_SPECS) as ComponentType[];

/** Map from component type → integer index for one-hot node encoding */
export const COMPONENT_TYPE_TO_INDEX: ReadonlyMap<ComponentType, number> = new Map(
  COMPONENT_TYPES.map((t, i) => [t, i])
);

/** Number of component types (dimension of one-hot type encoding) */
export const NUM_COMPONENT_TYPES = COMPONENT_TYPES.length;

// ---------------------------------------------------------------------------
// Validation utilities
// ---------------------------------------------------------------------------

/**
 * Get all input ports for a component type.
 * Bidirectional ports are included since they can receive signals.
 */
export function getInputPorts(type: ComponentType): PortDef[] {
  return PORT_SPECS[type].ports.filter(
    (p) => p.direction === "input" || p.direction === "bidirectional"
  );
}

/**
 * Get all output ports for a component type.
 * Bidirectional ports are included since they can emit signals.
 */
export function getOutputPorts(type: ComponentType): PortDef[] {
  return PORT_SPECS[type].ports.filter(
    (p) => p.direction === "output" || p.direction === "bidirectional"
  );
}

/**
 * Get all optical ports for a component type (excludes electrical).
 */
export function getOpticalPorts(type: ComponentType): PortDef[] {
  return PORT_SPECS[type].ports.filter((p) => p.signal === "optical");
}

/**
 * Check whether a port name is valid for a given component type.
 */
export function hasPort(type: ComponentType, portName: string): boolean {
  return PORT_SPECS[type].ports.some((p) => p.name === portName);
}

/**
 * Validate that a connection between two component ports is physically valid.
 *
 * Rules:
 * 1. Both port names must exist on their respective component types
 * 2. Source port must be output or bidirectional
 * 3. Target port must be input or bidirectional
 * 4. At least one side must be optical (no electrical-to-electrical through optical connections)
 */
export function isConnectionValid(
  fromType: ComponentType,
  fromPort: string,
  toType: ComponentType,
  toPort: string
): { valid: boolean; reason?: string } {
  const srcSpec = PORT_SPECS[fromType];
  const dstSpec = PORT_SPECS[toType];

  const srcPortDef = srcSpec.ports.find((p) => p.name === fromPort);
  if (!srcPortDef) {
    return { valid: false, reason: `Port "${fromPort}" does not exist on ${fromType}` };
  }

  const dstPortDef = dstSpec.ports.find((p) => p.name === toPort);
  if (!dstPortDef) {
    return { valid: false, reason: `Port "${toPort}" does not exist on ${toType}` };
  }

  if (srcPortDef.direction === "input") {
    return { valid: false, reason: `Port "${fromPort}" on ${fromType} is input-only — cannot be a connection source` };
  }

  if (dstPortDef.direction === "output") {
    return { valid: false, reason: `Port "${toPort}" on ${toType} is output-only — cannot be a connection target` };
  }

  // Prevent electrical-to-electrical routing through the optical fabric
  if (srcPortDef.signal === "electrical" && dstPortDef.signal === "electrical") {
    return { valid: false, reason: "Cannot connect electrical port to electrical port through optical fabric" };
  }

  return { valid: true };
}

/**
 * Validate all connections in a circuit layout against the port spec.
 * Returns an array of invalid connections with reasons.
 */
export function validateCircuitConnections(
  components: ReadonlyArray<{ id: string; type: ComponentType }>,
  connections: ReadonlyArray<{
    id: string;
    fromComponentId: string;
    fromPort: string;
    toComponentId: string;
    toPort: string;
  }>
): Array<{ connectionId: string; reason: string }> {
  const compMap = new Map(components.map((c) => [c.id, c.type]));
  const errors: Array<{ connectionId: string; reason: string }> = [];

  for (const conn of connections) {
    const fromType = compMap.get(conn.fromComponentId);
    const toType = compMap.get(conn.toComponentId);

    if (!fromType) {
      errors.push({ connectionId: conn.id, reason: `Source component "${conn.fromComponentId}" not found` });
      continue;
    }
    if (!toType) {
      errors.push({ connectionId: conn.id, reason: `Target component "${conn.toComponentId}" not found` });
      continue;
    }

    const result = isConnectionValid(fromType, conn.fromPort, toType, conn.toPort);
    if (!result.valid) {
      errors.push({ connectionId: conn.id, reason: result.reason! });
    }
  }

  return errors;
}
