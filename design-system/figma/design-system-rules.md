# Photonics Equilibrium — Figma Design System Rules

> Integration rules for translating Figma designs into production code.

---

## 1. Token Definitions

Design tokens live in `design-system/tokens/` as CSS custom properties.

```
design-system/tokens/
├── colors.css       — Circuit component colors, backgrounds, text, semantic
├── typography.css   — Font families, sizes, weights, line heights
├── spacing.css      — Spacing scale, radii, shadows, z-index
└── motion.css       — Durations, easings, photon animation params
```

**Format**: CSS Custom Properties (`--token-name: value`). All tokens are defined on `:root` and can be consumed directly in any CSS or via `var(--token-name)` in styled-components / Tailwind config.

**Figma ↔ Code mapping**: Figma color styles map 1:1 to `--color-*` tokens. Figma text styles map to composite `--type-*` tokens.

### Key Color Tokens → Figma Styles

| Figma Style Name | CSS Token | Hex |
|---|---|---|
| `Circuit/Fiber` | `--color-fiber` | `#60a5fa` |
| `Circuit/Waveguide` | `--color-waveguide` | `#a78bfa` |
| `Circuit/Ring` | `--color-ring` | `#f472b6` |
| `Circuit/MZI` | `--color-mzi` | `#34d399` |
| `Circuit/Detector` | `--color-detector` | `#fbbf24` |
| `Circuit/Splitter` | `--color-splitter` | `#fb923c` |
| `BG/Deep` | `--color-bg-deep` | `#030712` |
| `BG/Primary` | `--color-bg-primary` | `#0f172a` |
| `BG/Elevated` | `--color-bg-elevated` | `#1e293b` |
| `Text/Primary` | `--color-text-primary` | `#f1f5f9` |
| `Text/Secondary` | `--color-text-secondary` | `#94a3b8` |
| `Text/Tertiary` | `--color-text-tertiary` | `#64748b` |

---

## 2. Component Library

Components are React + TypeScript, located in `design-system/components/`.

### Architecture
- **Functional components** with hooks
- **Props interfaces** co-located with component
- **CSS custom properties** for theming (no CSS-in-JS runtime)
- **Tailwind CSS v4** utility classes for layout, token-backed values for color/type

### Key Components

| Component | File | Description |
|---|---|---|
| `CircuitCanvas` | `circuit-canvas.tsx` | Three.js/R3F viewport for photonic circuit |
| `InfoPanel` | `info-panel.tsx` | Glassmorphism overlay with component details |
| `Legend` | `legend.tsx` | Color-coded component type legend |
| `MetricDisplay` | `metric-display.tsx` | Monospace value + label pair |
| `ControlBar` | `control-bar.tsx` | Playback and view controls |

---

## 3. Frameworks & Libraries

| Layer | Technology |
|---|---|
| UI Framework | React 18+ with TypeScript strict |
| Meta-framework | Next.js 15 |
| Styling | Tailwind CSS v4 + CSS custom properties |
| 3D Engine | Three.js r128 (via CDN for standalone, R3F for React) |
| Animation | GSAP 3.12 |
| Build | Turbopack (Next.js) |

---

## 4. Styling Approach

### Methodology
- **Design tokens** as CSS custom properties (single source of truth)
- **Tailwind utilities** for layout, spacing, display
- **Token-backed values** for colors, typography (never hardcode hex in components)
- **Glassmorphism** pattern: `backdrop-filter: blur(20px)` + semi-transparent bg + subtle border

### Responsive Design
- Mobile-first breakpoints via Tailwind
- Circuit canvas is full-viewport, HUD adapts to screen size
- Info panels reposition on small screens

### Dark Mode
- **Dark-first** — the design system is built for dark backgrounds
- Light mode is not currently supported (photonic visualizations require dark bg)

---

## 5. Icon System

Circuit component icons use inline SVG with current-color fills. No external icon library — all photonic symbols are custom.

### Naming Convention
```
icon-{component}-{variant}
icon-fiber-input
icon-ring-resonator
icon-mzi-interferometer
icon-detector-ge
icon-splitter-y
```

---

## 6. Asset Management

- **3D assets**: Procedurally generated via Three.js (no external models)
- **Textures**: Canvas-generated (photon glow, grid patterns)
- **CDN**: Three.js and GSAP from cdnjs.cloudflare.com
- **Fonts**: Google Fonts (Inter, JetBrains Mono)

---

## 7. Project Structure

```
Photonics-Equilibrium/
├── design-system/
│   ├── DESIGN-SYSTEM.md              ← System documentation
│   ├── photonic-circuit-visual.html  ← Standalone Three.js visualization
│   ├── tokens/
│   │   ├── colors.css
│   │   ├── typography.css
│   │   ├── spacing.css
│   │   └── motion.css
│   ├── components/                   ← React component library
│   └── figma/
│       └── design-system-rules.md    ← This file
├── lib/                              ← Core ML/photonics library
├── scripts/                          ← Build and training scripts
├── artifacts/                        ← Generated outputs
└── docs/                             ← Technical documentation
```

---

## 8. Code Patterns

### Component Pattern
```tsx
// design-system/components/info-panel.tsx
interface InfoPanelProps {
  title: string;
  description: string;
  metrics: { value: string; label: string }[];
  visible: boolean;
}

export function InfoPanel({ title, description, metrics, visible }: InfoPanelProps) {
  return (
    <div className={`info-panel ${visible ? 'visible' : ''}`}>
      <h3>{title}</h3>
      <p>{description}</p>
      <div className="metric">
        {metrics.map((m, i) => (
          <div key={i} className="metric-item">
            <div className="metric-value">{m.value}</div>
            <div className="metric-label">{m.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Token Usage Pattern
```css
/* Always reference tokens, never hardcode */
.panel {
  background: var(--color-bg-overlay);
  border: var(--border-thin) solid var(--color-border-default);
  border-radius: var(--radius-lg);
  padding: var(--panel-padding);
  backdrop-filter: blur(20px);
}

.panel:hover {
  border-color: var(--color-border-hover);
}
```
