import { Router, type IRouter } from "express";

const router: IRouter = Router();

const componentLibrary = [
  {
    type: "laser_source",
    label: "Laser Source",
    description: "Coherent optical signal source. Provides the primary light input to the photonic circuit.",
    defaultParams: { wavelength: 1550, power: 0, bandwidth: 0.1 },
  },
  {
    type: "waveguide",
    label: "Waveguide",
    description: "Optical waveguide channel. Guides light with defined propagation loss and effective index.",
    defaultParams: { wavelength: 1550, length: 1000, neff: 2.4, alpha: 2.0 },
  },
  {
    type: "beam_splitter",
    label: "Beam Splitter",
    description: "Splits optical power into two output paths with a configurable split ratio.",
    defaultParams: { wavelength: 1550, splitRatio: 0.5, loss: 0.3 },
  },
  {
    type: "coupler",
    label: "Directional Coupler",
    description: "Evanescent-wave coupler transferring optical power between two waveguides.",
    defaultParams: { wavelength: 1550, couplingCoeff: 0.5, loss: 0.5 },
  },
  {
    type: "modulator",
    label: "Electro-Optic Modulator",
    description: "Modulates the optical signal. Parameters include insertion loss and extinction ratio.",
    defaultParams: { wavelength: 1550, loss: 5.0, extinctionRatio: 20, bandwidth: 40 },
  },
  {
    type: "photodetector",
    label: "Photodetector",
    description: "Converts optical signal to electrical current. Characterized by responsivity.",
    defaultParams: { wavelength: 1550, responsivity: 0.8, bandwidth: 100 },
  },
  {
    type: "optical_amplifier",
    label: "Optical Amplifier (EDFA)",
    description: "Erbium-doped fiber amplifier providing optical gain to compensate for system losses.",
    defaultParams: { wavelength: 1550, gain: 20, loss: 1.0 },
  },
  {
    type: "phase_shifter",
    label: "Phase Shifter",
    description: "Introduces a controlled phase shift to the optical signal.",
    defaultParams: { wavelength: 1550, phaseShift: 1.5708, loss: 0.5 },
  },
  {
    type: "filter",
    label: "Optical Filter",
    description: "Bandpass filter for wavelength selection. Defined by center wavelength and bandwidth.",
    defaultParams: { wavelength: 1550, loss: 1.0, bandwidth: 100 },
  },
  {
    type: "isolator",
    label: "Optical Isolator",
    description: "Prevents back-reflections from reaching sensitive components like laser sources.",
    defaultParams: { wavelength: 1550, loss: 0.5 },
  },
  {
    type: "circulator",
    label: "Optical Circulator",
    description: "Three-port device routing light from port 1→2, 2→3 only. Used for bidirectional transmission.",
    defaultParams: { wavelength: 1550, loss: 1.0 },
  },
  {
    type: "mzi",
    label: "Mach-Zehnder Interferometer",
    description: "Interferometric device for signal routing and modulation based on phase difference.",
    defaultParams: { wavelength: 1550, loss: 2.0, phaseShift: 1.5708 },
  },
  {
    type: "ring_resonator",
    label: "Ring Resonator",
    description: "Resonant optical filter with narrow linewidth. Critical for wavelength-division multiplexing.",
    defaultParams: { wavelength: 1550, loss: 3.0, couplingCoeff: 0.1 },
  },
  {
    type: "grating_coupler",
    label: "Grating Coupler",
    description: "Couples light between free-space or fiber and on-chip waveguide using diffractive grating.",
    defaultParams: { wavelength: 1550, loss: 3.0 },
  },
  {
    type: "mirror",
    label: "Reflective Mirror",
    description: "High-reflectivity mirror for optical cavities and resonator feedback.",
    defaultParams: { wavelength: 1550, reflectivity: 0.99 },
  },
];

router.get("/", (_req, res) => {
  res.json(componentLibrary);
});

export default router;
