# Component Reference

Every optical component available in Photonics-Equilibrium, explained in plain language.

Each component has **ports** (where light enters and exits) and **parameters** (settings that control how it behaves). When you drag a component onto the canvas, it comes with sensible defaults — but you can change any parameter in the Properties Panel.

---

## Sources (they create light)

### Laser Source
**What it does:** Creates a beam of coherent light. This is where every circuit starts.

**Analogy:** A very precise flashlight that produces light at exactly one color (wavelength).

**Ports:** 1 output

**Parameters:**
| Parameter | Default | Range | What It Means |
|-----------|---------|-------|--------------|
| wavelength | 1550 nm | 400–2000 nm | The "color" of the light. 1550 nm is standard for telecom. |
| power | 10 dBm | -30–30 dBm | How bright the laser is. 10 dBm ≈ 10 milliwatts. |
| bandwidth | 0.1 nm | 0.001–10 nm | How spread out the light's color is. Smaller = more pure. |

**Tips:**
- Most optical components are designed for 1550 nm. Stick with this unless you have a reason not to.
- Power of 0–10 dBm is typical. Going above 20 dBm is unusual outside of specialized applications.

---

## Passive Components (they guide and split light, no power needed)

### Waveguide
**What it does:** A tiny channel that carries light from one place to another — like a fiber optic cable on a chip.

**Analogy:** A pipe for light.

**Ports:** 1 input, 1 output

**Parameters:**
| Parameter | Default | Range | What It Means |
|-----------|---------|-------|--------------|
| length | 1 mm | 0.001–1000 mm | How long the waveguide is. Longer = more loss. |
| loss | 0.5 dB/cm | 0.01–10 dB/cm | How much light is lost per centimeter. |
| neff | 2.5 | 1.0–4.0 | Effective refractive index — how much the waveguide slows down light. |

**Tips:**
- A good waveguide has loss under 1 dB/cm. Anything above 3 dB/cm is lossy.
- Keep waveguides short when possible to minimize loss.

---

### Beam Splitter
**What it does:** Divides incoming light into two beams. You control the split ratio.

**Analogy:** A Y-junction in a pipe — some water goes left, some goes right.

**Ports:** 1 input, 2 outputs (output_1, output_2)

**Parameters:**
| Parameter | Default | Range | What It Means |
|-----------|---------|-------|--------------|
| splitRatio | 0.5 | 0.01–0.99 | Fraction of light going to output_1. Rest goes to output_2. |
| loss | 0.3 dB | 0–3 dB | Extra power lost during splitting (insertion loss). |

**Tips:**
- A 50/50 split (ratio = 0.5) is most common for interferometers.
- The two output powers should add up to (input power - insertion loss).

---

### Coupler (Directional Coupler)
**What it does:** Transfers light between two waveguides that run close together. Can combine or split signals.

**Analogy:** Two pipes placed side-by-side with a shared wall — some flow leaks between them.

**Ports:** 2 inputs (input_1, input_2), 2 outputs (output_1, output_2)

**Parameters:**
| Parameter | Default | Range | What It Means |
|-----------|---------|-------|--------------|
| couplingCoeff | 0.5 | 0.0–1.0 | How much light crosses over. 0 = none, 1 = all. |
| loss | 0.2 dB | 0–3 dB | Insertion loss. |

**Tips:**
- Coupling of 0.5 = 3 dB coupler (50/50 split), the most common type.
- Used in MZI designs to split and recombine light.

---

### Filter
**What it does:** Passes light at a specific wavelength and blocks everything else.

**Analogy:** A coffee filter, but for colors of light.

**Ports:** 1 input, 1 output

**Parameters:**
| Parameter | Default | Range | What It Means |
|-----------|---------|-------|--------------|
| wavelength | 1550 nm | 400–2000 nm | Center wavelength — the color it lets through. |
| bandwidth | 1 nm | 0.01–100 nm | How wide the passband is. Narrow = more selective. |
| loss | 0.5 dB | 0–10 dB | Insertion loss at the center wavelength. |

**Tips:**
- Match the filter's center wavelength to your laser's wavelength.
- Narrow bandwidth (< 1 nm) is good for picking out one channel from many.

---

### Isolator
**What it does:** Lets light pass in one direction but blocks it in the reverse direction.

**Analogy:** A one-way valve.

**Ports:** 1 input, 1 output

**Parameters:**
| Parameter | Default | Range | What It Means |
|-----------|---------|-------|--------------|
| loss | 0.5 dB | 0–3 dB | Forward insertion loss. |

**Tips:**
- Place after a laser to prevent back-reflections from destabilizing it.
- Cheap insurance for any circuit with reflective components.

---

### Circulator
**What it does:** Routes light between 3 or 4 ports in a specific order: Port 1 → Port 2 → Port 3 → Port 1.

**Analogy:** A traffic roundabout — light entering from one direction can only exit at the next exit.

**Ports:** 3 ports (input_1, input_2, output)

**Parameters:**
| Parameter | Default | Range | What It Means |
|-----------|---------|-------|--------------|
| loss | 0.7 dB | 0–3 dB | Insertion loss per pass. |

**Tips:**
- Commonly used with ring resonators to separate reflected and transmitted light.

---

### Mirror
**What it does:** Reflects most of the light back the way it came.

**Analogy:** A bathroom mirror, but for a specific wavelength of light.

**Ports:** 1 input, 1 output (the reflected light)

**Parameters:**
| Parameter | Default | Range | What It Means |
|-----------|---------|-------|--------------|
| reflectivity | 0.99 | 0.5–1.0 | What fraction of light is reflected. 0.99 = 99%. |
| loss | 0.1 dB | 0–3 dB | Loss during reflection. |

---

### Grating Coupler
**What it does:** Couples light between a waveguide on the chip and an external fiber or free-space beam.

**Analogy:** An on-ramp/off-ramp between a highway (fiber) and a surface street (chip waveguide).

**Ports:** 1 input, 1 output

**Parameters:**
| Parameter | Default | Range | What It Means |
|-----------|---------|-------|--------------|
| loss | 3.0 dB | 0.5–10 dB | Coupling loss. Typically 2–5 dB. |
| wavelength | 1550 nm | 400–2000 nm | Design wavelength. |
| bandwidth | 30 nm | 1–100 nm | Bandwidth over which coupling is efficient. |

---

## Active Components (they change the light's properties)

### Modulator
**What it does:** Changes the amplitude (brightness) or phase of the light, typically driven by an electrical signal. This is how you encode information onto light.

**Analogy:** A dimmer switch for light.

**Ports:** 1 input, 1 output

**Parameters:**
| Parameter | Default | Range | What It Means |
|-----------|---------|-------|--------------|
| extinctionRatio | 20 dB | 3–40 dB | How much the "off" state is dimmer than the "on" state. Higher = cleaner signal. |
| loss | 3.0 dB | 0–10 dB | Insertion loss. |

---

### Phase Shifter
**What it does:** Changes the phase of the light without changing its brightness. Used in interferometers to control constructive/destructive interference.

**Analogy:** Slowing down or speeding up one wave relative to another.

**Ports:** 1 input, 1 output

**Parameters:**
| Parameter | Default | Range | What It Means |
|-----------|---------|-------|--------------|
| phaseShift | π (3.14) | 0–2π | How much the phase changes, in radians. π = half a wavelength shift. |
| loss | 0.5 dB | 0–5 dB | Insertion loss. |

**Tips:**
- In an MZI, a π phase shift on one arm flips the output from constructive to destructive interference.

---

### Optical Amplifier
**What it does:** Boosts the power of the light signal. Compensates for losses in the circuit.

**Analogy:** A signal booster for light.

**Ports:** 1 input, 1 output

**Parameters:**
| Parameter | Default | Range | What It Means |
|-----------|---------|-------|--------------|
| gain | 20 dB | 0–40 dB | How much the signal is amplified. 20 dB = 100x power increase. |
| loss | 0.5 dB | 0–3 dB | Internal loss before amplification. |

**Tips:**
- Amplifiers add noise (amplified spontaneous emission). Don't chain too many together.
- Place after the longest lossy section to get the most benefit.

---

## Resonant Structures

### Mach-Zehnder Interferometer (MZI)
**What it does:** A pre-built interferometer structure. Splits light into two arms, applies different phases, and recombines.

**Analogy:** Two parallel roads of different lengths — when the cars (light waves) meet again at the end, they either reinforce or cancel each other.

**Ports:** 1 input, 2 outputs (output_1, output_2)

**Parameters:**
| Parameter | Default | Range | What It Means |
|-----------|---------|-------|--------------|
| phaseShift | π | 0–2π | Phase difference between the two arms. |
| loss | 1.0 dB | 0–5 dB | Total insertion loss. |
| splitRatio | 0.5 | 0.01–0.99 | Splitting ratio at the input coupler. |

---

### Ring Resonator
**What it does:** A circular waveguide that traps light at specific resonant wavelengths. Light builds up inside the ring.

**Analogy:** A whispering gallery — sound (light) bounces around the walls and builds up at certain pitches (wavelengths).

**Ports:** 1 input, 1 output

**Parameters:**
| Parameter | Default | Range | What It Means |
|-----------|---------|-------|--------------|
| wavelength | 1550 nm | 400–2000 nm | Resonant wavelength. |
| couplingCoeff | 0.1 | 0.01–0.99 | How easily light enters/exits the ring. |
| loss | 1.0 dB | 0–5 dB | Round-trip loss inside the ring. |

**Tips:**
- Low coupling (0.05–0.15) = high Q-factor = very narrow resonance = very sensitive to wavelength.
- Great for wavelength filtering and sensing applications.

---

## Detectors (they measure light)

### Photodetector
**What it does:** Converts light into an electrical signal. This is where you measure what comes out of the circuit.

**Analogy:** A solar cell — absorbs light and produces a measurable electrical current.

**Ports:** 1 input

**Parameters:**
| Parameter | Default | Range | What It Means |
|-----------|---------|-------|--------------|
| responsivity | 0.9 A/W | 0.1–1.2 A/W | How efficiently it converts light to current. 0.9 = 90% efficient. |
| bandwidth | 10 GHz | 0.1–100 GHz | Maximum signal frequency it can detect. |

**Tips:**
- Every circuit should end with at least one photodetector.
- Responsivity of 0.8–1.0 A/W is typical for InGaAs detectors at 1550 nm.

---

## How Parameters Are Encoded for ML

When the ML model processes a circuit, each component becomes a **29-dimensional vector**:

- **Bits 0–14** (15 values): One-hot encoding of the component type. For example, a laser source is `[1, 0, 0, 0, ..., 0]` and a waveguide is `[0, 1, 0, 0, ..., 0]`.
- **Bits 15–28** (14 values): Normalized parameters (wavelength, power, loss, splitRatio, couplingCoeff, length, neff, alpha, gain, responsivity, phaseShift, bandwidth, extinctionRatio, reflectivity). Each is scaled to 0–1 using min-max normalization. Parameters not relevant to a component type are set to their default normalized value.

Connections become **16-dimensional vectors**: 8 bits for the source port + 8 bits for the destination port.

This encoding is defined in `lib/ml-models/src/graphEncoder.ts`.

---

## Next Steps

- **Want to build circuits?** → [Circuit Guide](./circuit-guide.md)
- **Ready to generate training data?** → [ML Training Guide](./ml-training-guide.md)
