# Circuit Guide

This guide explains what photonic circuits are, how to build them in the app, and what makes a circuit "good" for ML training.

## What Is a Photonic Circuit?

A photonic circuit moves light (photons) through a chain of optical components — the same way an electronic circuit moves electricity through resistors, capacitors, and chips.

Think of it like plumbing:
- A **laser** is the faucet (it creates the light).
- **Waveguides** are the pipes (they carry the light).
- **Splitters** and **couplers** are T-junctions (they split or merge paths).
- A **photodetector** is the drain (it measures how much light arrives).

The simulator traces light from source to detector, calculating power, loss, noise, and phase at every step.

## Anatomy of a Circuit

Every circuit has three things:

### 1. Components
These are the building blocks. Each component has a **type** (e.g., `laser_source`, `waveguide`) and **parameters** (e.g., wavelength = 1550 nm, power = 10 dBm).

### 2. Connections
Wires between components. Each connection goes from one component's **output port** to another component's **input port**.

### 3. Layout
The spatial position of components on the canvas (x, y coordinates). This doesn't affect the physics — it's just for visual clarity.

## How to Build a Circuit in the App

### Step 1: Start a New Build
From the dashboard, click **New Build**. Give it a descriptive name like "Simple Laser-to-Detector" or "MZI with Phase Shifter."

### Step 2: Add Components
The left panel shows the **Component Library**. Drag components onto the canvas. A minimal circuit needs at least:
- One **Laser Source** (to create light)
- One **Photodetector** (to measure the light)

### Step 3: Wire Them Together
Click an output port (small circle on the right side of a component) and drag to an input port (small circle on the left side). A wire appears connecting them.

### Step 4: Set Parameters
Click any component to open the **Properties Panel** on the right. Here you can adjust:
- Wavelength (in nanometers)
- Power (in dBm)
- Loss, gain, split ratio, etc. (depends on the component type)

### Step 5: Simulate
Click **Simulate** in the bottom panel. The physics engine runs and returns:
- **Equilibrium Score** (0–100): How healthy the circuit is. 85+ = converged.
- **System Loss**: Total power lost from source to detector (in dB).
- **SNR**: Signal-to-noise ratio (higher is better).
- **Per-component results**: Power in/out, phase, status, and issues at each stage.

### Step 6: Fix Issues
The **Diagnostics Panel** (right side, "Diagnostics" tab) shows any problems:
- **Errors** (red): Things that break the circuit (e.g., no source, disconnected components).
- **Warnings** (yellow): Things that hurt performance (e.g., high loss, wavelength mismatch).
- **Info** (blue): Suggestions for improvement.

---

## Circuit Rules

The simulator enforces these rules:

1. **Every circuit needs at least one laser source.** Without a light source, there's nothing to simulate.
2. **Every circuit needs at least one photodetector.** Without a detector, there's no way to measure output.
3. **All components must be connected.** Orphan components generate warnings.
4. **Wavelengths should match.** If your laser emits at 1550 nm, your filter should be centered near 1550 nm.
5. **Power should stay in a reasonable range.** The simulator flags components receiving too little or too much power.

## What Makes a Good Training Example?

For ML training, we want **diverse, valid circuits** — not just perfect ones. A good dataset includes:

- **Simple circuits** (2–5 components): laser → waveguide → detector
- **Medium circuits** (5–15 components): interferometers, filters, amplified links
- **Complex circuits** (15–50 components): multi-stage designs with feedback
- **Working circuits** (score 85+) and **broken circuits** (score < 85): the model needs to learn both
- **Different topologies**: linear chains, tree structures, rings, parallel paths

The automated data generator (see [ML Training Guide](./ml-training-guide.md)) handles this for you using six built-in topology templates.

---

## Common Circuit Patterns

### 1. Linear Chain
The simplest useful circuit:
```
Laser → Waveguide → Waveguide → Detector
```

### 2. Mach-Zehnder Interferometer (MZI)
Splits light into two paths, modifies one, then recombines:
```
Laser → Splitter → [Upper arm: Phase Shifter]  → Combiner → Detector
                  → [Lower arm: Waveguide]      ↗
```
Used for: switching, sensing, modulation.

### 3. Ring Resonator Filter
Light circulates in a ring, filtering specific wavelengths:
```
Laser → Waveguide → Ring Resonator → Waveguide → Detector
```
Used for: wavelength selection, sensing.

### 4. Amplified Link
Boosts weak signals:
```
Laser → Waveguide → Optical Amplifier → Waveguide → Detector
```
Used for: long-distance communication.

### 5. Multi-Stage Filter
Cascaded filtering for high selectivity:
```
Laser → Filter → Isolator → Filter → Detector
```
Used for: wavelength-division multiplexing.

### 6. Star Coupler
One source, many outputs:
```
Laser → Coupler → Detector 1
                → Detector 2
                → Detector 3
```
Used for: signal distribution.

---

## Simulation Output Explained

When you run a simulation, here's what each number means:

| Metric | Unit | What It Means |
|--------|------|--------------|
| **Equilibrium Score** | 0–100 | Overall circuit health. 85+ means it's working well. |
| **Total Input Power** | dBm | How much light the laser(s) produce. |
| **Total Output Power** | dBm | How much light reaches the detector(s). |
| **System Loss** | dB | Power lost between input and output. Lower is better. |
| **SNR** | dB | Signal-to-noise ratio. Higher means cleaner signal. |
| **Coherence Length** | mm | How far the light stays "organized." Depends on bandwidth. |
| **Converged** | yes/no | Whether the circuit meets the 85% threshold. |

### Per-Component Results

Each component also reports:
- **Input Power / Output Power**: Power in dBm entering and leaving.
- **Phase**: Phase of the optical signal (radians).
- **Status**: `ok`, `warning`, or `error`.
- **Issues**: Specific problems and suggestions.

---

## Tips for Building Better Circuits

1. **Start simple.** Get a 2-component circuit working before adding complexity.
2. **Check wavelengths.** Most telecom components work at 1550 nm. Keep everything consistent.
3. **Watch the loss budget.** Every component adds loss. If total loss exceeds ~30 dB, your signal is probably too weak.
4. **Use amplifiers sparingly.** They boost signal but also add noise.
5. **Read the diagnostics.** The simulator tells you exactly what's wrong and how to fix it.

---

## Next Steps

- **Want to know what each component does?** → [Component Reference](./component-reference.md)
- **Ready to generate training data?** → [ML Training Guide](./ml-training-guide.md)
