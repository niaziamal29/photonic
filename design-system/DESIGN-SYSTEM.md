# Photonics Equilibrium — Design System

> Visual language for photonic circuit design, simulation, and AI-accelerated computation interfaces.

---

## 1. Design Tokens

### 1.1 Color Palette

#### Primary — Circuit Components
Each photonic component has a dedicated semantic color used consistently across all UI surfaces.

| Token | Hex | RGB | Usage |
|---|---|---|---|
| `--color-fiber` | `#60a5fa` | 96, 165, 250 | Fiber optic inputs, laser sources, coupling |
| `--color-waveguide` | `#a78bfa` | 167, 139, 250 | Silicon waveguides, routing, bus lines |
| `--color-ring` | `#f472b6` | 244, 114, 182 | Ring resonators, resonant cavities |
| `--color-mzi` | `#34d399` | 52, 211, 153 | Mach-Zehnder interferometers, phase modulators |
| `--color-detector` | `#fbbf24` | 251, 191, 36 | Photodetectors, output conversion |
| `--color-splitter` | `#fb923c` | 251, 146, 60 | Y-branches, directional couplers, MMIs |

#### Background & Surface
| Token | Hex | Usage |
|---|---|---|
| `--color-bg-deep` | `#030712` | Canvas background, scene BG |
| `--color-bg-primary` | `#0f172a` | Substrate, panels, cards |
| `--color-bg-elevated` | `#1e293b` | Elevated surfaces, hover states |
| `--color-bg-overlay` | `rgba(15, 23, 42, 0.85)` | Modals, tooltips, info panels |

#### Semantic
| Token | Hex | Usage |
|---|---|---|
| `--color-success` | `#34d399` | Valid circuits, passing simulations |
| `--color-warning` | `#fbbf24` | Loss warnings, sub-optimal configs |
| `--color-error` | `#ef4444` | Circuit errors, broken paths, high loss |
| `--color-info` | `#60a5fa` | Informational, help, tips |

#### Text
| Token | Hex | Usage |
|---|---|---|
| `--color-text-primary` | `#f1f5f9` | Headings, primary content |
| `--color-text-secondary` | `#94a3b8` | Body text, descriptions |
| `--color-text-tertiary` | `#64748b` | Captions, metadata, timestamps |
| `--color-text-muted` | `#475569` | Disabled, placeholder |

### 1.2 Typography

| Token | Value | Usage |
|---|---|---|
| `--font-display` | `'Inter', system-ui, sans-serif` | Headings, titles |
| `--font-body` | `'Inter', system-ui, sans-serif` | Body text, UI elements |
| `--font-mono` | `'JetBrains Mono', monospace` | Code, metrics, technical values |
| `--font-size-xs` | `10px` | Labels, chip annotations |
| `--font-size-sm` | `12px` | Captions, metadata |
| `--font-size-base` | `14px` | Body text |
| `--font-size-lg` | `16px` | Subheadings |
| `--font-size-xl` | `20px` | Section headers |
| `--font-size-2xl` | `28px` | Page titles |
| `--font-size-3xl` | `36px` | Hero text |

### 1.3 Spacing Scale

| Token | Value | Usage |
|---|---|---|
| `--space-1` | `4px` | Tight inline spacing |
| `--space-2` | `8px` | Component internal padding |
| `--space-3` | `12px` | Small gaps |
| `--space-4` | `16px` | Standard gap |
| `--space-6` | `24px` | Section spacing |
| `--space-8` | `32px` | Panel padding |
| `--space-12` | `48px` | Major section breaks |
| `--space-16` | `64px` | Page-level spacing |

### 1.4 Elevation (Shadows)

| Token | Value | Usage |
|---|---|---|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.3)` | Subtle lift |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.4)` | Cards, panels |
| `--shadow-lg` | `0 8px 24px rgba(0,0,0,0.5)` | Modals, popovers |
| `--shadow-glow-fiber` | `0 0 12px rgba(96,165,250,0.4)` | Fiber glow effect |
| `--shadow-glow-ring` | `0 0 12px rgba(244,114,182,0.4)` | Ring resonator glow |
| `--shadow-glow-mzi` | `0 0 12px rgba(52,211,153,0.4)` | MZI glow |

### 1.5 Border Radius

| Token | Value | Usage |
|---|---|---|
| `--radius-sm` | `4px` | Buttons, inputs |
| `--radius-md` | `8px` | Cards, small panels |
| `--radius-lg` | `12px` | Panels, modals |
| `--radius-xl` | `16px` | Hero cards |
| `--radius-full` | `9999px` | Chips, badges, avatars |

### 1.6 Motion

| Token | Value | Usage |
|---|---|---|
| `--duration-fast` | `150ms` | Hover states, micro-interactions |
| `--duration-normal` | `300ms` | Transitions, toggles |
| `--duration-slow` | `600ms` | Panel reveals, route transitions |
| `--duration-dramatic` | `1200ms` | Hero animations, onboarding |
| `--ease-default` | `cubic-bezier(0.4, 0, 0.2, 1)` | Standard easing |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Bouncy, energetic |
| `--ease-dramatic` | `cubic-bezier(0.16, 1, 0.3, 1)` | Expo-out, reveals |

### 1.7 Photon Animation Tokens

| Token | Value | Description |
|---|---|---|
| `--photon-speed-slow` | `0.001` | Detailed/educational view |
| `--photon-speed-normal` | `0.003` | Default simulation speed |
| `--photon-speed-fast` | `0.008` | Fast-forward mode |
| `--photon-size` | `0.25` | Base photon particle size |
| `--photon-glow-radius` | `0.4` | Soft glow around photons |
| `--photon-trail-length` | `8` | Frames of trail persistence |
| `--photon-pulse-freq` | `3Hz` | Intensity oscillation rate |

---

## 2. Component Library

### 2.1 Photonic Circuit Components

#### Fiber Optic Input
- **Visual**: Thick tube (r=0.35) transitioning to thin waveguide (r=0.08)
- **Color**: `--color-fiber` with outer jacket in `--color-bg-elevated`
- **Glow**: Radial glow plane at coupling point
- **Animation**: Photons spawn here and accelerate into chip

#### Grating Coupler
- **Visual**: Flat cylinder (r=0.4, h=0.1) at fiber-chip interface
- **Color**: `--color-fiber` with high metalness (0.8)
- **Label**: "GRATING COUPLER" in mono, uppercase, spaced

#### Silicon Waveguide
- **Visual**: Tube geometry following CatmullRom curves
- **Color**: `--color-waveguide` with emissive glow (0.3)
- **Cross-section**: 450nm × 220nm (scaled for visualization)
- **Bend radius**: Minimum 5μm (prevents radiation loss)

#### Y-Branch Splitter
- **Visual**: Single waveguide splitting into two, sphere junction node
- **Color**: `--color-splitter`
- **Animation**: Photons split probabilistically at junction
- **Metric overlay**: Split ratio percentage

#### Microring Resonator
- **Visual**: Torus/ring geometry (64 segments, radius 1.2)
- **Color**: `--color-ring` with pulsing emissive (0.3-0.6)
- **Bus waveguide**: Passes tangentially underneath
- **Animation**: Photons circulate in ring, couple in/out

#### Mach-Zehnder Interferometer
- **Visual**: Two parallel curved arms with input/output splitters
- **Color**: `--color-mzi`
- **Phase modulator**: Red heater element on one arm
- **Animation**: Photons split, one arm phase-shifted, recombine

#### Photodetector
- **Visual**: Box (0.8³) with active area and bond wires
- **Color**: `--color-detector` with gold metallic finish
- **Animation**: Glow intensifies as photons arrive
- **Metric**: Responsivity, bandwidth readout

### 2.2 UI Components

#### Info Panel
- **Surface**: `--color-bg-overlay` with blur(20px) backdrop
- **Border**: 1px `rgba(100,116,139,0.2)` with `--radius-lg`
- **Content**: Title (h3), description (p), 3-column metrics row
- **Animation**: Slide-down fade-in on hover/click

#### Legend
- **Layout**: Vertical stack, bottom-left
- **Items**: Colored dot (8px) + uppercase mono label
- **Interaction**: Click to highlight component + show info

#### Control Bar
- **Layout**: Horizontal stack, bottom-right
- **Buttons**: 40px square, glass-morphism background
- **States**: Default → Hover (border glow) → Active (fill)

#### Metric Display
- **Value**: JetBrains Mono, 16px, `--color-fiber`
- **Label**: 9px uppercase, letter-spacing 1px, `--color-text-tertiary`

---

## 3. Patterns

### 3.1 Circuit Canvas
Full-viewport 3D scene with substrate, waveguides, and animated photons. Dark background (`--color-bg-deep`) with atmospheric fog. Camera responds to mouse position for parallax depth.

### 3.2 Component Inspection
Click/hover any circuit element to reveal contextual info panel with technical specifications. Panel auto-dismisses after 8 seconds. Component glows intensify on focus.

### 3.3 Photon Flow Visualization
Particles follow predefined circuit paths using CatmullRom curves. Each path has a weighted probability for photon assignment. Colors match the dominant component on that path. Additive blending creates natural light accumulation at junctions.

### 3.4 Educational Overlay
HUD layer with title, subtitle, legend, controls, and real-time metrics. Non-intrusive — pointer-events: none except interactive elements. Glassmorphism surfaces maintain visibility over dynamic 3D content.

---

## 4. Photonic AI Computation Context

### Why Photonics for AI
Silicon photonics performs matrix-vector multiplications at the speed of light using Mach-Zehnder interferometer meshes. Each MZI encodes a single weight via thermo-optic phase shift. A mesh of N×N MZIs computes an N×N unitary matrix transformation in a single pass — O(1) latency regardless of matrix size.

### Key Advantages Over Electronic AI Accelerators
- **Speed**: Computation at ~200 THz carrier frequency vs ~5 GHz electronic clock
- **Energy**: ~1 fJ per MAC operation vs ~1 pJ for electronic (1000× improvement)
- **Bandwidth**: WDM enables parallel channels on single waveguide
- **Latency**: Single-pass analog computation, no clock cycles

### Circuit Architecture for Neural Network Inference
1. **Input encoding**: Laser source → MZI modulators encode input vector
2. **Weight matrix**: MZI mesh implements unitary decomposition of weight matrix
3. **Nonlinearity**: Optical-electronic-optical (OEO) conversion at each layer
4. **Readout**: Balanced photodetectors output result vector

---

## 5. File Structure

```
design-system/
├── DESIGN-SYSTEM.md              ← This document
├── photonic-circuit-visual.html  ← Interactive Three.js visualization
├── tokens/
│   ├── colors.css                ← CSS custom properties
│   ├── typography.css
│   ├── spacing.css
│   └── motion.css
├── components/
│   ├── circuit-canvas.tsx        ← React Three Fiber wrapper
│   ├── info-panel.tsx
│   ├── legend.tsx
│   ├── metric-display.tsx
│   └── control-bar.tsx
└── figma/
    └── design-system-rules.json  ← Figma-compatible token export
```
