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

export interface ComponentParams {
  wavelength?: number;
  power?: number;
  loss?: number;
  splitRatio?: number;
  couplingCoeff?: number;
  length?: number;
  neff?: number;
  alpha?: number;
  gain?: number;
  responsivity?: number;
  phaseShift?: number;
  bandwidth?: number;
  extinctionRatio?: number;
  reflectivity?: number;
}

export interface CircuitComponent {
  id: string;
  type: ComponentType;
  label: string;
  x: number;
  y: number;
  params: ComponentParams;
}

export interface Connection {
  id: string;
  fromComponentId: string;
  fromPort: string;
  toComponentId: string;
  toPort: string;
}

export interface CircuitLayout {
  components: CircuitComponent[];
  connections: Connection[];
}

export interface Issue {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  suggestion: string;
  componentId?: string;
}

export interface ComponentResult {
  componentId: string;
  label: string;
  type: ComponentType;
  inputPower: number;
  outputPower: number;
  phase: number;
  wavelength: number;
  loss: number;
  gain: number;
  status: "ok" | "warning" | "error";
  issues: Issue[];
}

export interface SimulationOutput {
  totalInputPower: number;
  totalOutputPower: number;
  systemLoss: number;
  snr: number;
  coherenceLength: number;
  wavelength: number;
  equilibriumScore: number;
  componentResults: ComponentResult[];
  issues: Issue[];
  converged: boolean;
  suggestions: string[];
}

export function dBmToWatts(dBm: number): number {
  return Math.pow(10, (dBm - 30) / 10);
}

export function wattsToDBm(W: number): number {
  if (W <= 0) return -100;
  return 10 * Math.log10(W) + 30;
}

function computeCoherenceLength(wavelength_nm: number, bandwidth_GHz: number): number {
  if (bandwidth_GHz <= 0) return 1e6; // effectively infinite
  const c = 3e8; // m/s
  const delta_nu = bandwidth_GHz * 1e9; // Hz
  return (c / delta_nu) * 1e3; // meters → millimeters
}

function topologicalSort(
  components: CircuitComponent[],
  connections: Connection[],
): { sorted: CircuitComponent[]; cycleNodeIds: Set<string> } {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const c of components) {
    inDegree.set(c.id, 0);
    adjacency.set(c.id, []);
  }
  for (const conn of connections) {
    adjacency.get(conn.fromComponentId)?.push(conn.toComponentId);
    inDegree.set(conn.toComponentId, (inDegree.get(conn.toComponentId) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sortedIds: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    sortedIds.push(id);
    for (const next of adjacency.get(id) ?? []) {
      const newDeg = (inDegree.get(next) ?? 1) - 1;
      inDegree.set(next, newDeg);
      if (newDeg === 0) queue.push(next);
    }
  }

  const sortedSet = new Set(sortedIds);
  const cycleNodeIds = new Set<string>();
  for (const c of components) {
    if (!sortedSet.has(c.id)) cycleNodeIds.add(c.id);
  }

  const allIds = [...sortedIds, ...cycleNodeIds];
  const idToComp = new Map(components.map(c => [c.id, c]));
  return {
    sorted: allIds.map(id => idToComp.get(id)!).filter(Boolean),
    cycleNodeIds,
  };
}

export function runPhotonicsSimulation(layout: CircuitLayout, targetWavelength: number, previousScore?: number): SimulationOutput {
  const { components, connections } = layout;

  if (components.length === 0) {
    return {
      totalInputPower: 0,
      totalOutputPower: 0,
      systemLoss: 0,
      snr: 0,
      coherenceLength: 0,
      wavelength: targetWavelength,
      equilibriumScore: 0,
      componentResults: [],
      issues: [{ code: "EMPTY_CIRCUIT", severity: "error", message: "No components in circuit", suggestion: "Add at least a laser source and a detector", componentId: undefined }],
      converged: false,
      suggestions: ["Add optical components to build your circuit"],
    };
  }

  const componentMap = new Map<string, CircuitComponent>();
  components.forEach(c => componentMap.set(c.id, c));

  const connectionMap = new Map<string, string[]>();
  connections.forEach(conn => {
    if (!connectionMap.has(conn.fromComponentId)) connectionMap.set(conn.fromComponentId, []);
    connectionMap.get(conn.fromComponentId)!.push(conn.toComponentId);
  });

  const allIssues: Issue[] = [];
  const componentResults: ComponentResult[] = [];

  const lasers = components.filter(c => c.type === "laser_source");
  const detectors = components.filter(c => c.type === "photodetector");

  if (lasers.length === 0) {
    allIssues.push({ code: "NO_SOURCE", severity: "error", message: "No laser source found in circuit", suggestion: "Add a laser_source component as the optical signal input", componentId: undefined });
  }
  if (detectors.length === 0) {
    allIssues.push({ code: "NO_DETECTOR", severity: "warning", message: "No photodetector found in circuit", suggestion: "Add a photodetector to measure the output signal", componentId: undefined });
  }

  const hasUnconnectedComponents = components.filter(c => {
    const outgoing = connections.filter(conn => conn.fromComponentId === c.id);
    const incoming = connections.filter(conn => conn.toComponentId === c.id);
    if (c.type === "laser_source") return outgoing.length === 0;
    if (c.type === "photodetector") return incoming.length === 0;
    return outgoing.length === 0 && incoming.length === 0;
  });

  for (const unconnected of hasUnconnectedComponents) {
    allIssues.push({
      code: "UNCONNECTED_COMPONENT",
      severity: "warning",
      message: `Component "${unconnected.label}" is not connected`,
      suggestion: `Connect "${unconnected.label}" to other components in the optical path`,
      componentId: unconnected.id,
    });
  }

  let totalInputPower = 0;
  let systemLoss = 0;
  let dominantWavelength = targetWavelength;

  // Build incoming connections lookup: componentId → list of upstream component IDs
  const incomingConnections = new Map<string, string[]>();
  for (const conn of connections) {
    if (!incomingConnections.has(conn.toComponentId)) {
      incomingConnections.set(conn.toComponentId, []);
    }
    incomingConnections.get(conn.toComponentId)!.push(conn.fromComponentId);
  }

  // Topological sort for correct evaluation order
  const { sorted: sortedComponents, cycleNodeIds } = topologicalSort(components, connections);

  // Track output power per component for propagation
  const outputPowerMap = new Map<string, number>();

  // Emit warnings for cycle nodes
  if (cycleNodeIds.size > 0) {
    allIssues.push({
      code: 'FEEDBACK_LOOP',
      severity: 'warning',
      message: `Feedback loop detected involving ${cycleNodeIds.size} component(s): ${[...cycleNodeIds].join(', ')}. Iterative convergence not yet implemented.`,
      suggestion: 'Ring resonator feedback loops will be evaluated without loop gain in this version.',
      componentId: undefined,
    });
  }

  for (const comp of sortedComponents) {
    const params = comp.params;
    const issues: Issue[] = [];
    let inputPower = 0;
    let outputPower = 0;
    let phase = 0;
    let loss = 0;
    let gain = 0;
    const compWavelength = params.wavelength ?? targetWavelength;

    // Compute input power from upstream connections
    if (comp.type === 'laser_source') {
      inputPower = params.power ?? 0;
    } else if (cycleNodeIds.has(comp.id)) {
      inputPower = -100; // no signal for unresolved cycle nodes
    } else {
      const upstreamIds = incomingConnections.get(comp.id) ?? [];
      if (upstreamIds.length === 0) {
        inputPower = -100; // disconnected
      } else if (upstreamIds.length === 1) {
        inputPower = outputPowerMap.get(upstreamIds[0]) ?? -100;
      } else {
        // Multiple inputs: sum in linear domain (watts)
        let totalWatts = 0;
        for (const uid of upstreamIds) {
          totalWatts += dBmToWatts(outputPowerMap.get(uid) ?? -100);
        }
        inputPower = totalWatts > 0 ? wattsToDBm(totalWatts) : -100;
      }
    }

    const wavelengthMismatch = Math.abs(compWavelength - targetWavelength);
    if (wavelengthMismatch > 10 && comp.type !== "filter") {
      issues.push({
        code: "WAVELENGTH_MISMATCH",
        severity: wavelengthMismatch > 50 ? "error" : "warning",
        message: `Wavelength ${compWavelength}nm deviates ${wavelengthMismatch.toFixed(1)}nm from target ${targetWavelength}nm`,
        suggestion: `Adjust wavelength to ${targetWavelength}nm for optimal performance`,
        componentId: comp.id,
      });
    }

    switch (comp.type) {
      case "laser_source": {
        outputPower = inputPower;
        totalInputPower += dBmToWatts(outputPower);
        gain = 0;
        loss = 0;
        dominantWavelength = compWavelength;
        if ((params.power ?? 0) > 20) {
          issues.push({ code: "HIGH_POWER", severity: "warning", message: `Laser power ${params.power}dBm is very high`, suggestion: "Consider using an attenuator or reducing pump current", componentId: comp.id });
        }
        if ((params.power ?? 0) < -10) {
          issues.push({ code: "LOW_POWER", severity: "info", message: `Laser power ${params.power}dBm may be too low for detection`, suggestion: "Increase power or add an optical amplifier", componentId: comp.id });
        }
        break;
      }
      case "waveguide": {
        const alpha = params.alpha ?? 2.0;
        const length = params.length ?? 1000;
        const propagationLoss = alpha * (length / 10000);
        loss = propagationLoss;
        outputPower = inputPower - propagationLoss;
        systemLoss += propagationLoss;
        const neff = params.neff ?? 2.4;
        phase = (2 * Math.PI * neff * length * 1e-6) / (compWavelength * 1e-9);
        if (alpha > 10) {
          issues.push({ code: "HIGH_PROPAGATION_LOSS", severity: "warning", message: `Propagation loss ${alpha}dB/cm is high`, suggestion: "Consider using a lower-loss waveguide material or shorter length", componentId: comp.id });
        }
        break;
      }
      case "beam_splitter": {
        const splitRatio = params.splitRatio ?? 0.5;
        if (splitRatio < 0 || splitRatio > 1) {
          issues.push({ code: "INVALID_SPLIT_RATIO", severity: "error", message: `Split ratio ${splitRatio} must be between 0 and 1`, suggestion: "Set split ratio between 0.0 and 1.0 (e.g., 0.5 for 50:50)", componentId: comp.id });
        }
        loss = params.loss ?? 0.3;
        outputPower = inputPower - loss;
        systemLoss += loss;
        break;
      }
      case "coupler": {
        const kappa = params.couplingCoeff ?? 0.5;
        if (kappa < 0 || kappa > 1) {
          issues.push({ code: "INVALID_COUPLING", severity: "error", message: `Coupling coefficient ${kappa} must be 0-1`, suggestion: "Set coupling coefficient between 0.0 and 1.0", componentId: comp.id });
        }
        loss = params.loss ?? 0.5;
        outputPower = inputPower - loss;
        systemLoss += loss;
        break;
      }
      case "optical_amplifier": {
        gain = params.gain ?? 10;
        loss = params.loss ?? 1.0;
        outputPower = inputPower + gain - loss;
        if (gain > 30) {
          issues.push({ code: "EXCESSIVE_GAIN", severity: "warning", message: `Gain of ${gain}dB may cause instability or ASE noise`, suggestion: "Consider splitting into multiple stages with isolators", componentId: comp.id });
        }
        systemLoss -= gain;
        break;
      }
      case "modulator": {
        const er = params.extinctionRatio ?? 20;
        loss = params.loss ?? 5.0;
        outputPower = inputPower - loss;
        systemLoss += loss;
        if (er < 10) {
          issues.push({ code: "LOW_EXTINCTION_RATIO", severity: "warning", message: `Extinction ratio ${er}dB is low`, suggestion: "Aim for >20dB extinction ratio for good signal quality", componentId: comp.id });
        }
        break;
      }
      case "photodetector": {
        const responsivity = params.responsivity ?? 0.8;
        loss = 0;
        outputPower = inputPower;
        if (responsivity < 0.5) {
          issues.push({ code: "LOW_RESPONSIVITY", severity: "warning", message: `Detector responsivity ${responsivity}A/W is low`, suggestion: "Use high-responsivity InGaAs detector (>0.8 A/W)", componentId: comp.id });
        }
        break;
      }
      case "phase_shifter": {
        phase = params.phaseShift ?? Math.PI;
        loss = params.loss ?? 0.5;
        outputPower = inputPower - loss;
        systemLoss += loss;
        break;
      }
      case "filter": {
        loss = params.loss ?? 1.0;
        const bw = params.bandwidth ?? 100;
        const passWavelength = params.wavelength ?? targetWavelength;
        const filterMismatch = Math.abs(passWavelength - targetWavelength);
        if (filterMismatch > bw / 2) {
          issues.push({ code: "FILTER_OUT_OF_BAND", severity: "error", message: `Signal at ${targetWavelength}nm is outside filter passband at ${passWavelength}nm ±${bw / 2}GHz`, suggestion: `Tune filter center to ${targetWavelength}nm`, componentId: comp.id });
        }
        outputPower = inputPower - loss;
        systemLoss += loss;
        break;
      }
      case "isolator": {
        loss = params.loss ?? 0.5;
        outputPower = inputPower - loss;
        systemLoss += loss;
        break;
      }
      case "circulator": {
        loss = params.loss ?? 1.0;
        outputPower = inputPower - loss;
        systemLoss += loss;
        break;
      }
      case "mzi": {
        loss = params.loss ?? 2.0;
        phase = params.phaseShift ?? Math.PI / 2;
        outputPower = inputPower - loss;
        systemLoss += loss;
        break;
      }
      case "ring_resonator": {
        loss = params.loss ?? 3.0;
        const couplingCoeff = params.couplingCoeff ?? 0.1;
        if (couplingCoeff > 0.5) {
          issues.push({ code: "OVERCOUPLED_RING", severity: "warning", message: `Ring resonator coupling ${couplingCoeff} is in over-coupled regime`, suggestion: "Reduce coupling coefficient below 0.5 for critical coupling", componentId: comp.id });
        }
        outputPower = inputPower - loss;
        systemLoss += loss;
        break;
      }
      case "grating_coupler": {
        loss = params.loss ?? 3.0;
        outputPower = inputPower - loss;
        systemLoss += loss;
        if (loss > 5) {
          issues.push({ code: "HIGH_COUPLING_LOSS", severity: "warning", message: `Grating coupler loss ${loss}dB is high`, suggestion: "Optimize grating period and fill factor for target wavelength", componentId: comp.id });
        }
        break;
      }
      case "mirror": {
        const reflectivity = params.reflectivity ?? 0.99;
        loss = -10 * Math.log10(reflectivity);
        outputPower = inputPower - loss;
        systemLoss += loss;
        break;
      }
    }

    outputPowerMap.set(comp.id, outputPower);

    const componentStatus: "ok" | "warning" | "error" = issues.some(i => i.severity === "error") ? "error" : issues.some(i => i.severity === "warning") ? "warning" : "ok";
    allIssues.push(...issues);

    componentResults.push({
      componentId: comp.id,
      label: comp.label,
      type: comp.type,
      inputPower,
      outputPower,
      phase: phase % (2 * Math.PI),
      wavelength: compWavelength,
      loss,
      gain,
      status: componentStatus,
      issues,
    });
  }

  const totalInputWatts = totalInputPower;
  const totalInputdBm = totalInputWatts > 0 ? wattsToDBm(totalInputWatts) : -100;

  // Compute total output power from detector outputs (or last components if no detectors)
  let totalOutputPower: number;
  if (detectors.length > 0) {
    let detectorWatts = 0;
    for (const det of detectors) {
      detectorWatts += dBmToWatts(outputPowerMap.get(det.id) ?? -100);
    }
    totalOutputPower = detectorWatts > 0 ? wattsToDBm(detectorWatts) : -100;
  } else {
    totalOutputPower = totalInputWatts > 0 ? wattsToDBm(totalInputWatts * Math.pow(10, -systemLoss / 10)) : -100;
  }

  const hasAmplifiers = components.some(c => c.type === "optical_amplifier");
  const noiseFloor = -80;
  const snr = totalOutputPower > noiseFloor ? totalOutputPower - noiseFloor + (hasAmplifiers ? -3 : 0) : 0;

  const laserBandwidth = lasers[0]?.params?.bandwidth ?? 0.1;
  const coherenceLength = computeCoherenceLength(dominantWavelength, laserBandwidth);

  const errorCount = allIssues.filter(i => i.severity === "error").length;
  const warningCount = allIssues.filter(i => i.severity === "warning").length;
  const hasSource = lasers.length > 0;
  const hasDetector = detectors.length > 0;
  const hasConnections = connections.length > 0;

  let equilibriumScore = 100;
  equilibriumScore -= errorCount * 20;
  equilibriumScore -= warningCount * 8;
  if (!hasSource) equilibriumScore -= 30;
  if (!hasDetector) equilibriumScore -= 10;
  if (!hasConnections && components.length > 1) equilibriumScore -= 20;
  if (systemLoss > 30) equilibriumScore -= 15;
  if (systemLoss > 15) equilibriumScore -= 5;
  equilibriumScore = Math.max(0, Math.min(100, equilibriumScore));

  const converged = equilibriumScore >= 85 && errorCount === 0 && warningCount <= 1 && cycleNodeIds.size === 0;

  const suggestions: string[] = [];
  if (!hasSource) suggestions.push("Add a laser source to begin building the optical circuit");
  if (!hasDetector) suggestions.push("Add a photodetector to complete the optical signal path");
  if (systemLoss > 20) suggestions.push(`Total system loss (${systemLoss.toFixed(1)}dB) is high — add an optical amplifier to compensate`);
  if (errorCount > 0) suggestions.push(`Fix ${errorCount} critical error${errorCount > 1 ? "s" : ""} before the circuit can converge`);
  if (warningCount > 2) suggestions.push(`Address ${warningCount} warnings to improve circuit performance`);
  if (equilibriumScore >= 85) suggestions.push("Circuit is approaching equilibrium — fine-tune parameters to reach 100% harmony");

  return {
    totalInputPower: totalInputdBm,
    totalOutputPower,
    systemLoss,
    snr,
    coherenceLength: Math.abs(coherenceLength),
    wavelength: dominantWavelength,
    equilibriumScore,
    componentResults,
    issues: allIssues,
    converged,
    suggestions,
  };
}
