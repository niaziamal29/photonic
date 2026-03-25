export {
  // Types
  type PortDirection,
  type SignalDomain,
  type PortDef,
  type ComponentPortSpec,
  type ComponentType,

  // Core data
  PORT_SPECS,
  ALL_PORT_NAMES,
  PORT_NAME_TO_INDEX,
  PORT_VOCAB_SIZE,
  COMPONENT_TYPES,
  COMPONENT_TYPE_TO_INDEX,
  NUM_COMPONENT_TYPES,

  // Utilities
  getInputPorts,
  getOutputPorts,
  getOpticalPorts,
  hasPort,
  isConnectionValid,
  validateCircuitConnections,
} from './portSpec.js';
