import { Router, type IRouter } from "express";

const router: IRouter = Router();

const componentLibrary = [
  {
    type: "laser_source",
    label: "Laser Source",
    category: "Sources",
    description: "Generates a coherent beam of light at a specific wavelength. This is the starting point of any photonic circuit — it provides the optical signal that travels through the system.",
    knowledge: {
      overview: "A laser source produces monochromatic, coherent light through stimulated emission. In photonic circuits, semiconductor lasers (like DFB or VCSEL) are most common. The output is characterized by its wavelength (color of light), power (brightness), and linewidth (spectral purity).",
      keyPrinciples: [
        "Stimulated emission produces photons with identical phase, frequency, and direction",
        "Coherence length depends on the laser's spectral linewidth — narrower linewidth means longer coherence",
        "Output power is typically measured in dBm (decibels relative to 1 milliwatt)",
        "Wavelength stability is critical for wavelength-division multiplexing (WDM) systems"
      ],
      typicalApplications: ["Telecommunications (1550nm C-band)", "Sensing and metrology", "LIDAR systems", "Optical interconnects"],
      commonIssues: ["Wavelength drift with temperature", "Mode hopping at high currents", "Back-reflections causing instability"],
      tips: "For telecom applications, use 1550nm (C-band) for lowest fiber loss. For silicon photonics, 1310nm is common. Keep power below 10dBm for most integrated circuits to avoid nonlinear effects."
    },
    defaultParams: { wavelength: 1550, power: 0, bandwidth: 0.1 },
    parameterDescriptions: {
      wavelength: {
        label: "Wavelength",
        unit: "nm",
        description: "The color of light produced. 1550nm is the telecom standard (lowest loss in fiber). 1310nm is used for short-reach and silicon photonics.",
        typicalRange: "1260–1625nm",
        impact: "Determines which components and materials are compatible. Must match the design wavelength of all downstream components."
      },
      power: {
        label: "Output Power",
        unit: "dBm",
        description: "How much optical power the laser emits. 0 dBm = 1 milliwatt. Every +3 dBm doubles the power, every -3 dBm halves it.",
        typicalRange: "-10 to +20 dBm",
        impact: "Higher power improves signal-to-noise ratio but can cause nonlinear effects. Too low and the detector won't register the signal."
      },
      bandwidth: {
        label: "Linewidth",
        unit: "GHz",
        description: "The spectral width of the laser output. Narrower linewidth means more coherent light and longer coherence length.",
        typicalRange: "0.001–10 GHz",
        impact: "Affects coherence length. Narrow linewidth (<1 MHz) needed for coherent detection and interferometric sensing."
      }
    }
  },
  {
    type: "waveguide",
    label: "Waveguide",
    category: "Passive",
    description: "A channel that guides light from one point to another on the chip, similar to how a wire carries electricity. Light is confined by total internal reflection.",
    knowledge: {
      overview: "Waveguides are the 'wires' of photonics. They confine and guide light using a higher-index core surrounded by a lower-index cladding. The key design parameters are the effective refractive index (which controls the speed of light in the guide), propagation loss (how much light is lost per unit length), and the waveguide dimensions.",
      keyPrinciples: [
        "Light is guided by total internal reflection — the core has a higher refractive index than the cladding",
        "Effective index (neff) determines the phase velocity of light in the waveguide",
        "Propagation loss is measured in dB/cm — lower is better",
        "Single-mode operation is preferred to avoid intermodal dispersion"
      ],
      typicalApplications: ["Connecting components on a photonic chip", "Delay lines", "Phase control sections", "Routing optical signals"],
      commonIssues: ["Sidewall roughness causes scattering loss", "Bending losses at tight curves", "Chromatic dispersion shifts phase at different wavelengths"],
      tips: "Silicon nitride (Si₃N₄) waveguides have ultra-low loss (~0.1 dB/cm). Silicon waveguides are more compact but lossier (~1-3 dB/cm). Keep bends above the minimum bend radius for your platform."
    },
    defaultParams: { wavelength: 1550, length: 1000, neff: 2.4, alpha: 2.0 },
    parameterDescriptions: {
      wavelength: {
        label: "Design Wavelength",
        unit: "nm",
        description: "The wavelength this waveguide is designed for. Should match your laser source.",
        typicalRange: "1260–1625nm",
        impact: "Waveguide dimensions and effective index are wavelength-dependent."
      },
      length: {
        label: "Length",
        unit: "μm",
        description: "Physical length of the waveguide. 1000 μm = 1 mm. Longer waveguides accumulate more loss and phase shift.",
        typicalRange: "10–100,000 μm",
        impact: "Total loss = propagation_loss × length. Longer waveguides also add more phase delay."
      },
      neff: {
        label: "Effective Index",
        unit: "",
        description: "How much the waveguide slows light compared to vacuum. Silicon waveguides typically have neff ≈ 2.4, glass fibers ≈ 1.46.",
        typicalRange: "1.4–3.5",
        impact: "Determines the phase accumulated per unit length. Critical for interferometer design."
      },
      alpha: {
        label: "Propagation Loss",
        unit: "dB/cm",
        description: "How much optical power is lost per centimeter of waveguide. Caused by material absorption and surface scattering.",
        typicalRange: "0.1–5 dB/cm",
        impact: "Directly reduces output power. High loss limits maximum circuit complexity."
      }
    }
  },
  {
    type: "beam_splitter",
    label: "Beam Splitter",
    category: "Passive",
    description: "Divides a single beam of light into two beams with a chosen power ratio. Think of it as a 'Y-junction' for light.",
    knowledge: {
      overview: "A beam splitter divides optical power between two output ports. The split ratio determines what fraction goes to each port. In integrated photonics, these are typically implemented as multimode interference (MMI) couplers or Y-junctions. A 50:50 splitter sends equal power to both outputs.",
      keyPrinciples: [
        "Power is conserved (minus insertion loss) — the two output powers sum to the input power",
        "Split ratio is defined as the fraction of power going to the 'through' port",
        "Excess loss is the power lost beyond what's split to outputs",
        "Broadband operation depends on the specific design (MMI vs Y-junction)"
      ],
      typicalApplications: ["Power monitoring (tap off a small fraction)", "Interferometer arms", "Signal distribution networks", "Balanced detection"],
      commonIssues: ["Imbalance between ports at non-design wavelengths", "Back-reflections at junctions", "Phase differences between output ports"],
      tips: "For 50:50 splitting, MMI couplers are more fabrication-tolerant than Y-junctions. Use a 90:10 or 95:5 splitter for monitoring taps to minimize signal loss."
    },
    defaultParams: { wavelength: 1550, splitRatio: 0.5, loss: 0.3 },
    parameterDescriptions: {
      wavelength: {
        label: "Design Wavelength",
        unit: "nm",
        description: "Wavelength the splitter is optimized for.",
        typicalRange: "1260–1625nm",
        impact: "Split ratio accuracy degrades away from the design wavelength."
      },
      splitRatio: {
        label: "Split Ratio",
        unit: "",
        description: "Fraction of power sent to the primary output (0 to 1). A value of 0.5 means 50/50 splitting. A value of 0.9 means 90% through, 10% tapped.",
        typicalRange: "0.01–0.99",
        impact: "Determines power distribution. Must be balanced for interferometers; asymmetric for monitoring."
      },
      loss: {
        label: "Insertion Loss",
        unit: "dB",
        description: "Extra power lost beyond the intended splitting. Caused by mode mismatch and radiation at the junction.",
        typicalRange: "0.1–1 dB",
        impact: "Lower is better. Accumulates with multiple splitters in cascade."
      }
    }
  },
  {
    type: "coupler",
    label: "Directional Coupler",
    category: "Passive",
    description: "Two waveguides placed close together so light 'leaks' from one to the other through evanescent wave coupling. The coupling strength depends on the gap and interaction length.",
    knowledge: {
      overview: "A directional coupler works by placing two waveguides in close proximity. The evanescent field of light in one waveguide overlaps with the other, transferring energy between them. The amount of coupling depends on the gap between waveguides, the interaction length, and the wavelength. This is a fundamental building block for interferometers, filters, and switches.",
      keyPrinciples: [
        "Coupling is wavelength-dependent — the same coupler has different splitting at different wavelengths",
        "Full power transfer occurs at the 'coupling length' — the length at which 100% of power crosses over",
        "The coupling coefficient κ (kappa) determines the fraction of power coupled to the cross port",
        "There is always a π/2 phase shift between the through and cross ports"
      ],
      typicalApplications: ["Mach-Zehnder interferometer input/output", "Ring resonator coupling", "Wavelength-selective filters", "Optical switches"],
      commonIssues: ["Sensitivity to fabrication variations in gap width", "Wavelength dependence of coupling ratio", "Polarization-dependent coupling"],
      tips: "For wavelength-insensitive operation, use broadband coupler designs (e.g., adiabatic couplers). The coupling coefficient is exponentially sensitive to the gap — small changes in gap cause large changes in coupling."
    },
    defaultParams: { wavelength: 1550, couplingCoeff: 0.5, loss: 0.5 },
    parameterDescriptions: {
      wavelength: {
        label: "Design Wavelength",
        unit: "nm",
        description: "Wavelength the coupler is designed for.",
        typicalRange: "1260–1625nm",
        impact: "Coupling ratio changes significantly with wavelength."
      },
      couplingCoeff: {
        label: "Coupling Coefficient (κ)",
        unit: "",
        description: "Fraction of power transferred to the coupled waveguide (0 to 1). κ=0 means no coupling (all light stays in the original guide). κ=1 means complete crossover.",
        typicalRange: "0.01–0.99",
        impact: "Determines the splitting ratio. κ=0.5 gives 50/50 splitting. For ring resonators, typically κ=0.05–0.3."
      },
      loss: {
        label: "Insertion Loss",
        unit: "dB",
        description: "Excess loss from scattering and radiation in the coupling region.",
        typicalRange: "0.1–1 dB",
        impact: "Adds to total system loss. Lower is better."
      }
    }
  },
  {
    type: "modulator",
    label: "Electro-Optic Modulator",
    category: "Active",
    description: "Encodes information onto the light beam by changing its intensity, phase, or both. This is how data gets written onto an optical signal.",
    knowledge: {
      overview: "Electro-optic modulators change the properties of light in response to an electrical signal. They work by applying a voltage that changes the refractive index of the waveguide material (electro-optic effect), which in turn changes the phase of the light. Mach-Zehnder modulators convert this phase change into intensity modulation. They are essential for optical communications.",
      keyPrinciples: [
        "Modulators encode data by varying the intensity or phase of light",
        "Extinction ratio is the contrast between 'on' and 'off' states — higher is better",
        "Bandwidth determines the maximum data rate (e.g., 40 GHz ≈ 40+ Gbps)",
        "Insertion loss reduces the overall signal power",
        "Vπ is the voltage needed for a π phase shift — lower Vπ means less driving power"
      ],
      typicalApplications: ["Data encoding in optical communications", "Signal switching", "Pulse carving", "Quantum key distribution"],
      commonIssues: ["Chirp (unwanted phase modulation alongside intensity modulation)", "Bias drift over time", "High insertion loss in some platforms", "Limited bandwidth"],
      tips: "Use push-pull configuration to reduce chirp. Silicon modulators are fast but have high Vπ. Lithium niobate (LiNbO₃) has low Vπ but larger footprint. Aim for extinction ratio >20 dB for good signal quality."
    },
    defaultParams: { wavelength: 1550, loss: 5.0, extinctionRatio: 20, bandwidth: 40 },
    parameterDescriptions: {
      wavelength: {
        label: "Operating Wavelength",
        unit: "nm",
        description: "Wavelength the modulator is designed for.",
        typicalRange: "1260–1625nm",
        impact: "Must match the laser source wavelength."
      },
      loss: {
        label: "Insertion Loss",
        unit: "dB",
        description: "How much power is lost passing through the modulator. This is typically the largest single loss in a photonic circuit.",
        typicalRange: "2–10 dB",
        impact: "Major contributor to system loss. Silicon modulators: ~5–7 dB. LiNbO₃: ~3–4 dB."
      },
      extinctionRatio: {
        label: "Extinction Ratio",
        unit: "dB",
        description: "The contrast between the brightest 'on' state and darkest 'off' state. Higher means cleaner signal encoding.",
        typicalRange: "10–40 dB",
        impact: "Below 10 dB the signal quality degrades significantly. Aim for >20 dB for long-haul telecom."
      },
      bandwidth: {
        label: "Modulation Bandwidth",
        unit: "GHz",
        description: "The maximum frequency at which the modulator can switch on/off. Determines maximum data rate.",
        typicalRange: "10–100 GHz",
        impact: "Limits the system's data throughput. 40 GHz supports ~100 Gbps with advanced modulation formats."
      }
    }
  },
  {
    type: "photodetector",
    label: "Photodetector",
    category: "Detectors",
    description: "Converts light back into an electrical signal. This is the 'receiver' at the end of the optical path — it measures how much light arrives.",
    knowledge: {
      overview: "Photodetectors convert photons into electrical current through the photoelectric effect. In telecommunications, PIN photodiodes and avalanche photodiodes (APDs) are most common. The key performance metrics are responsivity (how efficiently photons convert to current), bandwidth (how fast it can respond), and dark current (noise when no light is present).",
      keyPrinciples: [
        "Responsivity (A/W) = photocurrent / optical power — higher means better sensitivity",
        "InGaAs detectors work best at 1300–1600nm; Ge detectors at 1300–1550nm; Si detectors at 400–1100nm",
        "Bandwidth is limited by carrier transit time and RC time constant",
        "Dark current sets the noise floor — determines minimum detectable power",
        "Quantum efficiency is the probability that a photon generates an electron-hole pair"
      ],
      typicalApplications: ["Signal reception in optical links", "Power monitoring", "Optical sensing", "Coherent detection (with local oscillator)"],
      commonIssues: ["Saturation at high optical power", "Temperature-dependent dark current", "Capacitance limits bandwidth", "Polarization sensitivity"],
      tips: "InGaAs detectors are the standard for 1550nm. For high-speed applications (>25 GHz), use waveguide-integrated Ge photodetectors on silicon. Responsivity >0.8 A/W is good; >1.0 A/W is excellent."
    },
    defaultParams: { wavelength: 1550, responsivity: 0.8, bandwidth: 100 },
    parameterDescriptions: {
      wavelength: {
        label: "Detection Wavelength",
        unit: "nm",
        description: "Center wavelength the detector is optimized for. Must match your signal wavelength.",
        typicalRange: "800–1650nm",
        impact: "Responsivity drops sharply outside the detector material's absorption band."
      },
      responsivity: {
        label: "Responsivity",
        unit: "A/W",
        description: "Amperes of photocurrent per Watt of optical power. Measures how efficiently the detector converts light to electricity.",
        typicalRange: "0.5–1.2 A/W",
        impact: "Higher responsivity means stronger electrical signal. Below 0.5 A/W, you may need an amplifier."
      },
      bandwidth: {
        label: "Bandwidth",
        unit: "GHz",
        description: "Maximum signal frequency the detector can faithfully reproduce. Limits how fast the overall system can operate.",
        typicalRange: "10–100 GHz",
        impact: "Must be at least as large as the modulation bandwidth to avoid distortion."
      }
    }
  },
  {
    type: "optical_amplifier",
    label: "Optical Amplifier (EDFA)",
    category: "Active",
    description: "Boosts the optical signal power without converting to electricity first. Like a volume knob for light — it makes the signal stronger to compensate for losses.",
    knowledge: {
      overview: "Erbium-Doped Fiber Amplifiers (EDFAs) amplify optical signals directly in the optical domain. A pump laser excites erbium ions in a doped fiber, which then amplify passing signals through stimulated emission. EDFAs work across the C-band (1530–1565nm) and can amplify many wavelength channels simultaneously. They are the backbone of long-haul fiber optic networks.",
      keyPrinciples: [
        "Gain is measured in dB — +20 dB means the signal is amplified 100×",
        "Amplified Spontaneous Emission (ASE) adds noise to the amplified signal",
        "Noise figure measures how much the amplifier degrades the signal-to-noise ratio (typically 4–6 dB)",
        "Gain saturation occurs when input power is high — gain decreases as input increases",
        "EDFAs only work in the C-band (~1530–1565nm) and L-band (~1565–1625nm)"
      ],
      typicalApplications: ["Compensating fiber span loss in telecom links", "Pre-amplification before detection", "Booster amplification after modulation", "WDM system amplification"],
      commonIssues: ["ASE noise accumulates in multi-amplifier chains", "Gain tilt (uneven gain across wavelengths)", "Transient effects when channels are added/dropped", "Does not work outside the erbium gain band"],
      tips: "Place an isolator after each EDFA to prevent back-reflections from causing instability. For gains >20 dB, consider using two-stage designs with mid-stage components (filters, gain equalizers). Keep gain below 30 dB per stage."
    },
    defaultParams: { wavelength: 1550, gain: 20, loss: 1.0 },
    parameterDescriptions: {
      wavelength: {
        label: "Center Wavelength",
        unit: "nm",
        description: "Wavelength of the signal being amplified. EDFAs work in the C-band (1530–1565nm).",
        typicalRange: "1530–1565nm",
        impact: "Gain varies with wavelength across the EDFA bandwidth."
      },
      gain: {
        label: "Signal Gain",
        unit: "dB",
        description: "How much the signal power is amplified. +10 dB = 10× power increase. +20 dB = 100× increase.",
        typicalRange: "10–30 dB",
        impact: "Higher gain compensates more loss but adds more noise. Excessive gain (>30 dB) can cause instability."
      },
      loss: {
        label: "Internal Loss",
        unit: "dB",
        description: "Power loss within the amplifier itself (connectors, splices, internal components).",
        typicalRange: "0.5–2 dB",
        impact: "Reduces the effective gain. Net gain = gain - internal_loss."
      }
    }
  },
  {
    type: "phase_shifter",
    label: "Phase Shifter",
    category: "Active",
    description: "Adjusts the timing (phase) of the light wave without changing its power. Used to tune interferometers and control how light waves combine.",
    knowledge: {
      overview: "Phase shifters change the optical phase of light passing through them. In integrated photonics, this is typically done by heating a waveguide section (thermo-optic effect) or applying a voltage (electro-optic effect). Phase control is essential for tuning interferometers, switch matrices, and programmable photonic circuits.",
      keyPrinciples: [
        "Phase is measured in radians — π radians (3.14 rad) is a half-wavelength shift",
        "A π phase shift in one arm of an interferometer switches from constructive to destructive interference",
        "Thermo-optic phase shifters are slow (~μs) but have unlimited range",
        "Electro-optic phase shifters are fast (~ps) but have limited phase range",
        "Phase shift accumulates linearly with length: Δφ = (2π/λ) × Δn × L"
      ],
      typicalApplications: ["Tuning Mach-Zehnder interferometers", "Reconfigurable optical switches", "Phase-array beam steering", "Programmable photonic processors"],
      commonIssues: ["Thermal crosstalk to neighboring components", "Power consumption for thermo-optic tuning", "Drift requiring feedback control"],
      tips: "For precise tuning, use a feedback loop monitoring the output power. π phase shift is the most commonly needed value (switches an MZI between outputs). Thermo-optic shifters consume ~10–50 mW per π shift."
    },
    defaultParams: { wavelength: 1550, phaseShift: 1.5708, loss: 0.5 },
    parameterDescriptions: {
      wavelength: {
        label: "Operating Wavelength",
        unit: "nm",
        description: "Wavelength of light being phase-shifted.",
        typicalRange: "1260–1625nm",
        impact: "Phase shift in radians = (2π × neff_change × length) / wavelength."
      },
      phaseShift: {
        label: "Phase Shift",
        unit: "radians",
        description: "How much the light wave's timing is shifted. π/2 (1.57 rad) is a quarter-wave shift. π (3.14 rad) is a half-wave shift that flips interference from constructive to destructive.",
        typicalRange: "0–2π (0–6.28 rad)",
        impact: "Determines the operating point of connected interferometers."
      },
      loss: {
        label: "Insertion Loss",
        unit: "dB",
        description: "Power lost due to the phase shifter section (absorption from doping, metal heater proximity, etc.).",
        typicalRange: "0.1–1 dB",
        impact: "Adds to total system loss."
      }
    }
  },
  {
    type: "filter",
    label: "Optical Filter",
    category: "Passive",
    description: "Selects specific wavelengths of light and blocks others. Like a color filter for invisible infrared light — it lets the wanted signal through and rejects noise or other channels.",
    knowledge: {
      overview: "Optical filters select specific wavelength channels from a multi-wavelength signal. They can be implemented as thin-film filters, fiber Bragg gratings, arrayed waveguide gratings (AWGs), or ring resonators. Filters are critical for wavelength-division multiplexing (WDM) systems where many signals share the same fiber at different wavelengths.",
      keyPrinciples: [
        "Bandwidth defines the range of wavelengths passed — narrower is more selective",
        "Passband should be centered on the signal wavelength for minimum loss",
        "Rejection ratio describes how well out-of-band signals are blocked (typically >20 dB)",
        "Shape factor describes how 'flat' the top of the passband is — flatter is better for data signals"
      ],
      typicalApplications: ["Wavelength demultiplexing (separating WDM channels)", "ASE noise filtering after amplifiers", "Channel selection in reconfigurable networks", "Sensing (isolating specific spectral features)"],
      commonIssues: ["Center wavelength drift with temperature", "Chromatic dispersion at filter edges", "Cascading filters narrows the effective passband"],
      tips: "For WDM systems, ensure the filter bandwidth matches the ITU grid spacing (100 GHz or 50 GHz). Place a filter after each EDFA to remove out-of-band ASE noise."
    },
    defaultParams: { wavelength: 1550, loss: 1.0, bandwidth: 100 },
    parameterDescriptions: {
      wavelength: {
        label: "Center Wavelength",
        unit: "nm",
        description: "The wavelength at which the filter has maximum transmission. Should match your signal wavelength.",
        typicalRange: "1260–1625nm",
        impact: "If misaligned from the signal, the filter will attenuate or block your signal."
      },
      loss: {
        label: "Insertion Loss",
        unit: "dB",
        description: "Power lost even for wavelengths within the passband (from material absorption, scattering).",
        typicalRange: "0.5–3 dB",
        impact: "Adds to total system loss."
      },
      bandwidth: {
        label: "Passband Width",
        unit: "GHz",
        description: "The width of the wavelength window that passes through. Narrower = more selective. 100 GHz ≈ 0.8nm at 1550nm.",
        typicalRange: "10–400 GHz",
        impact: "Must be wide enough to pass your signal but narrow enough to reject adjacent channels."
      }
    }
  },
  {
    type: "isolator",
    label: "Optical Isolator",
    category: "Passive",
    description: "A one-way valve for light — it lets light pass forward but blocks it from traveling backward. Protects sensitive components like lasers from harmful back-reflections.",
    knowledge: {
      overview: "Optical isolators use the Faraday effect (magneto-optic rotation) to create a one-way optical path. Light traveling forward passes through with low loss, while backward-traveling light is rotated and blocked. They are essential for protecting laser sources from destabilizing back-reflections.",
      keyPrinciples: [
        "Isolation is measured in dB — higher means better backward blocking (typically 30–60 dB)",
        "Forward insertion loss should be minimal (<1 dB)",
        "Based on Faraday rotation — a non-reciprocal magneto-optic effect",
        "Polarization-dependent isolators require linearly polarized input; polarization-independent versions exist"
      ],
      typicalApplications: ["Protecting laser sources from reflections", "After EDFAs to prevent lasing from back-reflections", "In feedback-sensitive circuits"],
      commonIssues: ["Magnetic materials are difficult to integrate on-chip", "Polarization sensitivity in some designs", "Limited bandwidth"],
      tips: "Always place an isolator immediately after a laser source. In amplified systems, place one after each EDFA. For integrated photonics, consider using alternative approaches (e.g., temporal modulation) since magneto-optic integration is challenging."
    },
    defaultParams: { wavelength: 1550, loss: 0.5 },
    parameterDescriptions: {
      wavelength: {
        label: "Operating Wavelength",
        unit: "nm",
        description: "Wavelength range over which the isolator functions correctly.",
        typicalRange: "1260–1625nm",
        impact: "Isolation degrades outside the design bandwidth."
      },
      loss: {
        label: "Forward Insertion Loss",
        unit: "dB",
        description: "Power lost for light traveling in the forward (allowed) direction.",
        typicalRange: "0.3–1 dB",
        impact: "Adds to system loss. Lower is better."
      }
    }
  },
  {
    type: "circulator",
    label: "Optical Circulator",
    category: "Passive",
    description: "A three-port device that routes light in a circle: port 1→2, port 2→3. Light entering port 2 goes to port 3 (not back to port 1). Used for bidirectional communication on a single fiber.",
    knowledge: {
      overview: "Optical circulators route light based on the port it enters. Light from port 1 exits port 2, light from port 2 exits port 3, and so on. Like isolators, they rely on the non-reciprocal Faraday effect. Circulators enable full-duplex communication on a single fiber and are used to extract reflected signals from devices like fiber Bragg gratings.",
      keyPrinciples: [
        "Non-reciprocal routing: port 1→2→3 (not reversible)",
        "Isolation between non-adjacent ports is typically 40–50 dB",
        "Insertion loss is typically 0.5–1 dB per pass",
        "Can function as an isolator (if port 3 is terminated)"
      ],
      typicalApplications: ["Separating transmitted and reflected signals", "Bidirectional fiber links", "Fiber Bragg grating interrogation", "OTDR (Optical Time-Domain Reflectometry)"],
      commonIssues: ["Bulky — hard to integrate on chip", "Port-to-port crosstalk", "Cost (more expensive than couplers)"],
      tips: "Use a circulator instead of a coupler when you need to separate forward and backward-traveling light without the 3 dB loss penalty of a coupler. Connect port 3 to a detector for monitoring reflections."
    },
    defaultParams: { wavelength: 1550, loss: 1.0 },
    parameterDescriptions: {
      wavelength: {
        label: "Operating Wavelength",
        unit: "nm",
        description: "Wavelength range over which the circulator operates.",
        typicalRange: "1260–1625nm",
        impact: "Performance degrades outside the design band."
      },
      loss: {
        label: "Insertion Loss",
        unit: "dB",
        description: "Power lost per port-to-port transit (e.g., port 1 to port 2).",
        typicalRange: "0.5–1.5 dB",
        impact: "Each transit adds loss. Counts twice if signal makes a round trip."
      }
    }
  },
  {
    type: "mzi",
    label: "Mach-Zehnder Interferometer",
    category: "Structures",
    description: "Two waveguide paths that split and recombine light. By adjusting the phase difference between the paths, you control whether light exits the top or bottom output. A fundamental building block for switches and modulators.",
    knowledge: {
      overview: "The Mach-Zehnder Interferometer (MZI) splits light into two arms, introduces a phase difference, then recombines the light. When the arms are in phase (Δφ = 0), light exits one port (constructive interference). When they're π out of phase (Δφ = π), light exits the other port (destructive interference). MZIs are used for switching, modulation, and sensing.",
      keyPrinciples: [
        "Output depends on the phase difference between the two arms: cos²(Δφ/2)",
        "Δφ = 0 → all light to bar port (constructive interference)",
        "Δφ = π → all light to cross port (destructive interference)",
        "Extinction ratio depends on how balanced the splitting and combining is",
        "The free spectral range (FSR) depends on the path length difference"
      ],
      typicalApplications: ["Intensity modulators", "2×2 optical switches", "Tunable filters (unbalanced MZI)", "Sensor interrogators", "Programmable photonic meshes"],
      commonIssues: ["Arm imbalance reduces extinction ratio", "Temperature sensitivity of path length difference", "Requires active tuning for stable operation"],
      tips: "For a switch, use a balanced MZI (equal arm lengths) with a phase shifter in one arm. For a filter, use unbalanced arms — the FSR = λ²/(neff × ΔL). Cascade MZIs for higher-order filter responses."
    },
    defaultParams: { wavelength: 1550, loss: 2.0, phaseShift: 1.5708 },
    parameterDescriptions: {
      wavelength: {
        label: "Operating Wavelength",
        unit: "nm",
        description: "Signal wavelength passing through the interferometer.",
        typicalRange: "1260–1625nm",
        impact: "The interference condition is wavelength-dependent."
      },
      loss: {
        label: "Total Insertion Loss",
        unit: "dB",
        description: "Combined loss from the input splitter, waveguide arms, and output combiner.",
        typicalRange: "1–4 dB",
        impact: "Dominated by splitter/combiner losses. Adds to system budget."
      },
      phaseShift: {
        label: "Arm Phase Difference",
        unit: "radians",
        description: "Phase difference between the two arms. Controls the switching/modulation state. π/2 (1.57) = 50/50 split. π (3.14) = full crossover.",
        typicalRange: "0–2π (0–6.28 rad)",
        impact: "Determines the output state. Dynamic tuning enables switching and modulation."
      }
    }
  },
  {
    type: "ring_resonator",
    label: "Ring Resonator",
    category: "Structures",
    description: "A circular waveguide loop coupled to a straight waveguide. Light that matches the ring's resonance wavelength gets trapped and circulates, creating a very sharp wavelength filter.",
    knowledge: {
      overview: "Ring resonators are compact wavelength-selective filters. Light at resonant wavelengths couples into the ring and circulates, building up intensity. At resonance, the ring acts as a notch filter — dropping specific wavelengths from the through port. Add-drop configurations can route specific wavelengths to a different output. They are key to wavelength-division multiplexing on chip.",
      keyPrinciples: [
        "Resonance condition: the round-trip path length must be an integer multiple of the wavelength (2π × R × neff = m × λ)",
        "Free Spectral Range (FSR) is the spacing between resonant peaks — smaller rings have larger FSR",
        "Quality factor (Q) measures how sharp the resonance is — higher Q = narrower linewidth",
        "Critical coupling occurs when the coupling matches the round-trip loss — gives deepest notch",
        "Finesse = FSR / linewidth — measures the ratio of peak spacing to peak width"
      ],
      typicalApplications: ["WDM channel add/drop filters", "Laser cavity mirrors", "Optical sensors (refractive index sensing)", "Modulators (shift resonance with voltage)", "Optical delay lines"],
      commonIssues: ["Temperature sensitivity of resonance wavelength (~80 pm/°C for silicon)", "Fabrication-dependent resonance position", "Limited FSR for large rings", "Bending loss in small rings"],
      tips: "Silicon ring resonators at 1550nm typically have 5–20 μm radius. Smaller radius = larger FSR but more bending loss. Critical coupling gives the deepest notch — tune the coupling coefficient to match internal losses."
    },
    defaultParams: { wavelength: 1550, loss: 3.0, couplingCoeff: 0.1 },
    parameterDescriptions: {
      wavelength: {
        label: "Resonant Wavelength",
        unit: "nm",
        description: "The wavelength that matches the ring's resonance condition. This is the wavelength that gets filtered.",
        typicalRange: "1260–1625nm",
        impact: "Only light near this wavelength is affected by the ring. Other wavelengths pass through unaffected."
      },
      loss: {
        label: "Round-Trip Loss",
        unit: "dB",
        description: "Total power lost per circulation in the ring. Includes propagation loss, bending loss, and coupling loss.",
        typicalRange: "1–5 dB",
        impact: "Higher loss reduces Q factor and broadens the resonance. Must be balanced by coupling for critical coupling."
      },
      couplingCoeff: {
        label: "Coupling Coefficient (κ)",
        unit: "",
        description: "Fraction of light coupled from the bus waveguide into the ring per pass. Critical coupling occurs when κ² equals the round-trip power loss.",
        typicalRange: "0.01–0.5",
        impact: "Under-coupled (κ too small): shallow notch. Over-coupled (κ too large): broad resonance. Critical: deepest notch."
      }
    }
  },
  {
    type: "grating_coupler",
    label: "Grating Coupler",
    category: "Passive",
    description: "Connects light between an optical fiber (above the chip) and a waveguide (on the chip). Uses a periodic pattern of ridges that deflect light at the right angle to enter/exit the chip.",
    knowledge: {
      overview: "Grating couplers use a periodic pattern etched into a waveguide to diffract light between a nearly vertical fiber and a horizontal on-chip waveguide. They are the most common way to get light on and off photonic chips. The grating period determines which wavelength couples most efficiently.",
      keyPrinciples: [
        "The grating equation determines the coupling angle: sin(θ) = neff - λ/Λ (where Λ is the grating period)",
        "Coupling efficiency depends on the grating strength, period, fill factor, and fiber angle",
        "Bandwidth is typically 30–50nm, centered on the design wavelength",
        "Coupling efficiency of 50–80% is typical (1–3 dB loss)"
      ],
      typicalApplications: ["Fiber-to-chip coupling", "Chip-to-fiber output coupling", "Wafer-level testing", "Optical I/O for photonic integrated circuits"],
      commonIssues: ["High coupling loss compared to edge couplers", "Narrow bandwidth", "Polarization sensitivity", "Back-reflections into the chip"],
      tips: "Standard grating couplers have ~3 dB loss. Optimized designs with bottom reflectors can achieve <1 dB. For broadband operation, consider apodized gratings. Align the fiber at the design angle (typically 8–12° from vertical)."
    },
    defaultParams: { wavelength: 1550, loss: 3.0 },
    parameterDescriptions: {
      wavelength: {
        label: "Design Wavelength",
        unit: "nm",
        description: "Wavelength for optimal coupling efficiency. The grating period is designed for this specific wavelength.",
        typicalRange: "1260–1625nm",
        impact: "Coupling efficiency drops rapidly (>1 dB) for wavelengths more than 20–30nm from the design center."
      },
      loss: {
        label: "Coupling Loss",
        unit: "dB",
        description: "Power lost when coupling between the fiber and waveguide. Includes diffraction inefficiency, mode mismatch, and back-reflection.",
        typicalRange: "1–5 dB",
        impact: "This is often the largest single loss in a photonic circuit. Two couplers (input + output) double the impact."
      }
    }
  },
  {
    type: "mirror",
    label: "Reflective Mirror",
    category: "Passive",
    description: "Reflects light back the way it came. Used in optical cavities (like laser resonators) and for creating standing wave patterns. High reflectivity means almost all light bounces back.",
    knowledge: {
      overview: "Mirrors in photonic circuits reflect light with high efficiency. They can be implemented as distributed Bragg reflectors (DBRs — periodic layers of different materials), loop mirrors (a waveguide loop that reflects via interference), or metal-coated facets. Mirrors are essential for laser cavities and Fabry-Pérot interferometers.",
      keyPrinciples: [
        "Reflectivity (R) ranges from 0 (no reflection) to 1 (perfect mirror)",
        "R = 0.99 means 99% of light is reflected and 1% transmitted",
        "Loss = -10×log₁₀(R) in dB. R=0.99 → 0.04 dB loss. R=0.9 → 0.46 dB loss",
        "DBR mirrors can achieve R > 0.999 (>99.9% reflectivity)",
        "Phase shift on reflection depends on the mirror structure"
      ],
      typicalApplications: ["Laser cavities (feedback for lasing)", "Fabry-Pérot interferometers", "Loop mirrors for signal routing", "Reflective modulators"],
      commonIssues: ["Bandwidth limitation of DBR mirrors", "Scattering losses from surface imperfections", "Alignment sensitivity for free-space mirrors"],
      tips: "For laser cavities, use one high-R mirror (>99%) as the back reflector and one lower-R mirror (50–90%) as the output coupler. DBR mirrors with more periods have higher reflectivity but also narrower bandwidth."
    },
    defaultParams: { wavelength: 1550, reflectivity: 0.99 },
    parameterDescriptions: {
      wavelength: {
        label: "Design Wavelength",
        unit: "nm",
        description: "Wavelength for peak reflectivity.",
        typicalRange: "1260–1625nm",
        impact: "Reflectivity drops at wavelengths far from the design center, especially for DBR mirrors."
      },
      reflectivity: {
        label: "Reflectivity",
        unit: "",
        description: "Fraction of light reflected (0 to 1). 0.99 = 99% reflected. 0.5 = half reflected, half transmitted.",
        typicalRange: "0.5–0.999",
        impact: "Higher reflectivity means less light passes through. For laser output couplers, use 0.5–0.9. For back reflectors, use >0.99."
      }
    }
  }
];

router.get("/", (_req, res) => {
  res.json(componentLibrary);
});

export default router;
