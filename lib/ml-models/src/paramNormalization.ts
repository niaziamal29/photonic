/**
 * Default parameters for each component type. Used for null imputation
 * during GNN encoding — a waveguide with alpha=0 is physically different
 * from alpha=2.0 (the default). Never impute with zeros.
 */
export const DEFAULT_PARAMS: Record<string, Record<string, number>> = {
  laser_source: { wavelength: 1550, power: 0, bandwidth: 0.1 },
  waveguide: { wavelength: 1550, alpha: 2.0, length: 1000, neff: 2.4 },
  beam_splitter: { wavelength: 1550, splitRatio: 0.5, loss: 0.3 },
  coupler: { wavelength: 1550, couplingCoeff: 0.5, loss: 0.5 },
  modulator: { wavelength: 1550, extinctionRatio: 20, loss: 5.0 },
  photodetector: { wavelength: 1550, responsivity: 0.8 },
  optical_amplifier: { wavelength: 1550, gain: 10, loss: 1.0 },
  phase_shifter: { wavelength: 1550, phaseShift: 3.14159, loss: 0.5 },
  filter: { wavelength: 1550, bandwidth: 100, loss: 1.0 },
  isolator: { wavelength: 1550, loss: 0.5 },
  circulator: { wavelength: 1550, loss: 1.0 },
  mzi: { wavelength: 1550, phaseShift: 1.5708, loss: 2.0 },
  ring_resonator: { wavelength: 1550, couplingCoeff: 0.1, loss: 3.0 },
  grating_coupler: { wavelength: 1550, loss: 3.0 },
  mirror: { wavelength: 1550, reflectivity: 0.99 },
};

/** Parameter names in fixed order for the feature vector */
export const PARAM_NAMES = [
  "wavelength", "power", "loss", "splitRatio", "couplingCoeff",
  "length", "neff", "alpha", "gain", "responsivity",
  "phaseShift", "bandwidth", "extinctionRatio", "reflectivity",
] as const;

export const NUM_PARAMS = PARAM_NAMES.length;

/**
 * Min/max bounds for parameter normalization to [0, 1].
 * Derived from component library typical ranges.
 */
export const PARAM_RANGES: Record<string, [number, number]> = {
  wavelength: [400, 2000],
  power: [-40, 30],
  loss: [0, 30],
  splitRatio: [0, 1],
  couplingCoeff: [0, 1],
  length: [0, 100000],
  neff: [1.0, 4.0],
  alpha: [0, 20],
  gain: [0, 40],
  responsivity: [0, 2],
  phaseShift: [0, 6.284],
  bandwidth: [0, 1000],
  extinctionRatio: [0, 40],
  reflectivity: [0, 1],
};

export function normalizeParam(name: string, value: number): number {
  const range = PARAM_RANGES[name];
  if (!range) return 0;
  const [min, max] = range;
  if (max <= min) return 0;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

export function denormalizeParam(name: string, normalized: number): number {
  const range = PARAM_RANGES[name];
  if (!range) return 0;
  const [min, max] = range;
  return normalized * (max - min) + min;
}

export function imputeDefault(type: string, paramName: string): number {
  return DEFAULT_PARAMS[type]?.[paramName] ?? 0;
}
