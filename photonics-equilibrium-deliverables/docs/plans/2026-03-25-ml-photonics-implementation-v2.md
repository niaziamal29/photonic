# ML Photonics Surrogate & Generative Engine — Implementation Plan v2

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an ML system that instantly predicts photonic circuit performance (GNN+Transformer surrogate) and generates novel circuit topologies from user specs (cVAE → diffusion upgrade path), integrated into the existing Photonics-Equilibrium app.

**Architecture:**
- **Forward surrogate:** MPNN (6 layers, GRU aggregation) + 2-layer Set Transformer global head. ONNX Runtime in Node.js for <5ms inference.
- **Generative model:** cVAE for Stage 1 proof-of-concept, discrete diffusion (DiGress-style) for Stage 1.5. Runs as Python FastAPI sidecar — autoregressive graph decoders don't export cleanly to ONNX.
- **Real-time feedback:** REST POST /predict with debounced React Query mutation (Stage 1). WebSocket added in Stage 2 for generation streaming.
- **Training data:** Synthetic from corrected physics engine (500K-1M circuits), augmented with 3 HF datasets.

**Tech Stack:** PyTorch + PyTorch Geometric (training), ONNX Runtime Node.js (forward inference), FastAPI (generation sidecar), Vitest (testing), Zustand (frontend state), React + ReactFlow (UI)

**Revision notes:** This plan incorporates independent architecture review feedback addressing: missing port specifications, GNN+Transformer head restoration, WebSocket→REST simplification for Stage 1, cVAE runtime correction (Python sidecar not ONNX), training pipeline task splitting, cycle handling, migration planning, observability, and active learning quality gates.

---

## Phase 0: Formal Port Specification

The circuit generator, GNN edge encoding, and validation logic all need to know which ports exist on each component type and which connections are physically valid. This doesn't exist in the codebase today — the `Connection` type uses freeform strings for `fromPort`/`toPort`.

### Task 0: Define Port Specification for All 15 Component Types

**Files:**
- Create: `lib/ml-models/src/portSpec.ts`
- Create: `lib/ml-models/src/__tests__/portSpec.test.ts`

**Step 1: Create the port specification**

```typescript
// lib/ml-models/src/portSpec.ts
export type PortDirection = "input" | "output" | "bidirectional";

export interface PortDef {
  name: string;
  direction: PortDirection;
}

export interface ComponentPortSpec {
  ports: PortDef[];
  maxInputs: number;
  maxOutputs: number;
}

/**
 * Formal port specification for each of the 15 component types.
 * Drives: circuit generator, GNN edge encoding, connection validation.
 */
export const PORT_SPECS: Record<string, ComponentPortSpec> = {
  laser_source: {
    ports: [{ name: "out", direction: "output" }],
    maxInputs: 0,
    maxOutputs: 1,
  },
  waveguide: {
    ports: [
      { name: "in", direction: "input" },
      { name: "out", direction: "output" },
    ],
    maxInputs: 1,
    maxOutputs: 1,
  },
  beam_splitter: {
    ports: [
      { name: "in", direction: "input" },
      { name: "out1", direction: "output" },
      { name: "out2", direction: "output" },
    ],
    maxInputs: 1,
    maxOutputs: 2,
  },
  coupler: {
    ports: [
      { name: "in1", direction: "input" },
      { name: "in2", direction: "input" },
      { name: "out", direction: "output" },
    ],
    maxInputs: 2,
    maxOutputs: 1,
  },
  modulator: {
    ports: [
      { name: "in", direction: "input" },
      { name: "out", direction: "output" },
    ],
    maxInputs: 1,
    maxOutputs: 1,
  },
  photodetector: {
    ports: [{ name: "in", direction: "input" }],
    maxInputs: 1,
    maxOutputs: 0,
  },
  optical_amplifier: {
    ports: [
      { name: "in", direction: "input" },
      { name: "out", direction: "output" },
    ],
    maxInputs: 1,
    maxOutputs: 1,
  },
  phase_shifter: {
    ports: [
      { name: "in", direction: "input" },
      { name: "out", direction: "output" },
    ],
    maxInputs: 1,
    maxOutputs: 1,
  },
  filter: {
    ports: [
      { name: "in", direction: "input" },
      { name: "out", direction: "output" },
    ],
    maxInputs: 1,
    maxOutputs: 1,
  },
  isolator: {
    ports: [
      { name: "in", direction: "input" },
      { name: "out", direction: "output" },
    ],
    maxInputs: 1,
    maxOutputs: 1,
  },
  circulator: {
    ports: [
      { name: "port1", direction: "bidirectional" },
      { name: "port2", direction: "bidirectional" },
      { name: "port3", direction: "bidirectional" },
    ],
    maxInputs: 3,
    maxOutputs: 3,
  },
  mzi: {
    ports: [
      { name: "in", direction: "input" },
      { name: "out", direction: "output" },
    ],
    maxInputs: 1,
    maxOutputs: 1,
  },
  ring_resonator: {
    ports: [
      { name: "in", direction: "input" },
      { name: "through", direction: "output" },
      { name: "drop", direction: "output" },
    ],
    maxInputs: 1,
    maxOutputs: 2,
  },
  grating_coupler: {
    ports: [
      { name: "in", direction: "input" },
      { name: "out", direction: "output" },
    ],
    maxInputs: 1,
    maxOutputs: 1,
  },
  mirror: {
    ports: [{ name: "port", direction: "bidirectional" }],
    maxInputs: 1,
    maxOutputs: 1,
  },
};

/**
 * Validate that a connection between two components is physically possible.
 */
export function isValidConnection(
  fromType: string,
  fromPort: string,
  toType: string,
  toPort: string,
): boolean {
  const fromSpec = PORT_SPECS[fromType];
  const toSpec = PORT_SPECS[toType];
  if (!fromSpec || !toSpec) return false;

  const fromPortDef = fromSpec.ports.find(p => p.name === fromPort);
  const toPortDef = toSpec.ports.find(p => p.name === toPort);
  if (!fromPortDef || !toPortDef) return false;

  const fromOk = fromPortDef.direction === "output" || fromPortDef.direction === "bidirectional";
  const toOk = toPortDef.direction === "input" || toPortDef.direction === "bidirectional";
  return fromOk && toOk;
}
```

**Step 2: Write tests for port spec**

```typescript
// lib/ml-models/src/__tests__/portSpec.test.ts
import { describe, it, expect } from "vitest";
import { PORT_SPECS, isValidConnection } from "../portSpec.js";

describe("PORT_SPECS", () => {
  it("defines specs for all 15 component types", () => {
    expect(Object.keys(PORT_SPECS)).toHaveLength(15);
  });

  it("laser_source has no inputs", () => {
    expect(PORT_SPECS.laser_source.maxInputs).toBe(0);
  });

  it("photodetector has no outputs", () => {
    expect(PORT_SPECS.photodetector.maxOutputs).toBe(0);
  });

  it("beam_splitter has 2 outputs", () => {
    expect(PORT_SPECS.beam_splitter.maxOutputs).toBe(2);
  });
});

describe("isValidConnection", () => {
  it("allows laser out → waveguide in", () => {
    expect(isValidConnection("laser_source", "out", "waveguide", "in")).toBe(true);
  });

  it("rejects detector → laser (detector has no output port)", () => {
    expect(isValidConnection("photodetector", "in", "laser_source", "out")).toBe(false);
  });

  it("rejects laser → laser (laser has no input port)", () => {
    expect(isValidConnection("laser_source", "out", "laser_source", "out")).toBe(false);
  });
});
```

**Step 3: Run tests**

Run: `cd lib/ml-models && pnpm test`

**Step 4: Commit**

```bash
git add lib/ml-models/src/portSpec.ts lib/ml-models/src/__tests__/
git commit -m "feat: add formal port specification for all 15 component types"
```

---

## Phase 1: Fix the Physics Engine (Oracle)

The engine must be correct before generating training data. Every simulation result currently in the database is wrong because power doesn't propagate through the circuit graph.

### Task 1: Add Vitest to the API Server

**Files:**
- Modify: `artifacts/api-server/package.json`
- Create: `artifacts/api-server/vitest.config.ts`
- Create: `artifacts/api-server/src/lib/__tests__/photonicsEngine.test.ts`

**Step 1: Install vitest**

Run: `pnpm add -D vitest --filter api-server`

**Step 2: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { globals: true, include: ['src/**/__tests__/**/*.test.ts'] },
});
```

**Step 3: Add test script**

Add to `artifacts/api-server/package.json` scripts: `"test": "vitest run", "test:watch": "vitest"`

**Step 4: Write skeleton test**

```typescript
// artifacts/api-server/src/lib/__tests__/photonicsEngine.test.ts
import { describe, it, expect } from 'vitest';
import { runPhotonicsSimulation, type CircuitLayout } from '../photonicsEngine.js';

describe('photonicsEngine', () => {
  it('returns empty circuit error for no components', () => {
    const layout: CircuitLayout = { components: [], connections: [] };
    const result = runPhotonicsSimulation(layout, 1550);
    expect(result.issues[0].code).toBe('EMPTY_CIRCUIT');
  });
});
```

**Step 5: Run test — verify setup works**

Run: `cd artifacts/api-server && pnpm test`
Expected: 1 test passes

**Step 6: Commit**

```bash
git commit -m "feat: add vitest to api-server with skeleton engine test"
```

---

### Task 2: Fix Coherence Length Formula (C4)

Both the dead `computeCoherenceLength` function (line 102) and the inline calculation (line 367) are algebraically wrong. The function simplifies to `c² / (Δν² × 1e-6)` — dimensionally nonsensical. Correct formula: `L_c = c / Δν`.

**Files:**
- Modify: `artifacts/api-server/src/lib/photonicsEngine.ts:102-107, 367`
- Modify: `artifacts/api-server/src/lib/__tests__/photonicsEngine.test.ts`

**Step 1: Write failing tests**

```typescript
describe('coherence length', () => {
  it('L_c = c/Δν: 0.1 GHz → 3000 mm', () => {
    const layout: CircuitLayout = {
      components: [
        { id: 'l', type: 'laser_source', label: 'L', x: 0, y: 0, params: { wavelength: 1550, power: 0, bandwidth: 0.1 } },
        { id: 'd', type: 'photodetector', label: 'D', x: 100, y: 0, params: { responsivity: 0.8 } },
      ],
      connections: [{ id: 'e', fromComponentId: 'l', fromPort: 'out', toComponentId: 'd', toPort: 'in' }],
    };
    const result = runPhotonicsSimulation(layout, 1550);
    expect(result.coherenceLength).toBeCloseTo(3000, 0);
  });

  it('L_c = c/Δν: 10 GHz → 30 mm', () => {
    const layout: CircuitLayout = {
      components: [
        { id: 'l', type: 'laser_source', label: 'L', x: 0, y: 0, params: { wavelength: 1550, power: 0, bandwidth: 10 } },
      ],
      connections: [],
    };
    const result = runPhotonicsSimulation(layout, 1550);
    expect(result.coherenceLength).toBeCloseTo(30, 0);
  });
});
```

**Step 2: Run — verify failure**

**Step 3: Fix both locations**

Line 102-107 — replace function body:
```typescript
function computeCoherenceLength(wavelength_nm: number, bandwidth_GHz: number): number {
  if (bandwidth_GHz <= 0) return 1e6;
  const c = 3e8;
  const delta_nu = bandwidth_GHz * 1e9;
  return (c / delta_nu) * 1e3; // meters → millimeters
}
```

Line 367 — replace inline calculation with function call:
```typescript
const laserBandwidth = lasers[0]?.params?.bandwidth ?? 0.1;
const coherenceLength = computeCoherenceLength(dominantWavelength, laserBandwidth);
```

**Step 4: Run — verify pass**

**Step 5: Commit**

```bash
git commit -m "fix: correct coherence length formula L_c = c / delta_nu (C4)"
```

---

### Task 3: Implement Topological Sort + Graph Power Propagation + Cycle Handling (I4)

The simulation loop iterates components in array order. Every non-source component gets `inputPower = 0`. The `connectionMap` built on lines 131-135 is never read. Ring resonators create cycles — Kahn's algorithm will drop them.

**Strategy:** Topological sort via Kahn's algorithm. Components not reachable via sort (cycles) are flagged with a warning and evaluated with `inputPower = -100` (no signal). Cycle convergence is a Stage 2 feature.

**Files:**
- Modify: `artifacts/api-server/src/lib/photonicsEngine.ts`
- Modify: `artifacts/api-server/src/lib/__tests__/photonicsEngine.test.ts`

**Step 1: Write failing tests**

```typescript
describe('graph power propagation', () => {
  it('laser 10 dBm → waveguide (2 dB loss) → detector receives 8 dBm', () => {
    const layout: CircuitLayout = {
      components: [
        { id: 'l', type: 'laser_source', label: 'L', x: 0, y: 0, params: { wavelength: 1550, power: 10, bandwidth: 0.1 } },
        { id: 'w', type: 'waveguide', label: 'W', x: 100, y: 0, params: { alpha: 2.0, length: 10000, neff: 2.4 } },
        { id: 'd', type: 'photodetector', label: 'D', x: 200, y: 0, params: { responsivity: 0.8 } },
      ],
      connections: [
        { id: 'e1', fromComponentId: 'l', fromPort: 'out', toComponentId: 'w', toPort: 'in' },
        { id: 'e2', fromComponentId: 'w', fromPort: 'out', toComponentId: 'd', toPort: 'in' },
      ],
    };
    const result = runPhotonicsSimulation(layout, 1550);
    const wg = result.componentResults.find(r => r.componentId === 'w')!;
    expect(wg.inputPower).toBeCloseTo(10, 1);
    expect(wg.outputPower).toBeCloseTo(8, 1);
    const det = result.componentResults.find(r => r.componentId === 'd')!;
    expect(det.inputPower).toBeCloseTo(8, 1);
  });

  it('amplifier: 0 dBm in + 10 dB gain - 1 dB loss = 9 dBm out', () => {
    const layout: CircuitLayout = {
      components: [
        { id: 'l', type: 'laser_source', label: 'L', x: 0, y: 0, params: { power: 0, wavelength: 1550, bandwidth: 0.1 } },
        { id: 'a', type: 'optical_amplifier', label: 'A', x: 100, y: 0, params: { gain: 10, loss: 1 } },
        { id: 'd', type: 'photodetector', label: 'D', x: 200, y: 0, params: { responsivity: 0.8 } },
      ],
      connections: [
        { id: 'e1', fromComponentId: 'l', fromPort: 'out', toComponentId: 'a', toPort: 'in' },
        { id: 'e2', fromComponentId: 'a', fromPort: 'out', toComponentId: 'd', toPort: 'in' },
      ],
    };
    const result = runPhotonicsSimulation(layout, 1550);
    const amp = result.componentResults.find(r => r.componentId === 'a')!;
    expect(amp.inputPower).toBeCloseTo(0, 1);
    expect(amp.outputPower).toBeCloseTo(9, 1);
  });

  it('disconnected components get -100 dBm input', () => {
    const layout: CircuitLayout = {
      components: [
        { id: 'l', type: 'laser_source', label: 'L', x: 0, y: 0, params: { power: 10, wavelength: 1550, bandwidth: 0.1 } },
        { id: 'w', type: 'waveguide', label: 'Floating', x: 200, y: 200, params: { alpha: 2, length: 1000 } },
      ],
      connections: [],
    };
    const result = runPhotonicsSimulation(layout, 1550);
    const wg = result.componentResults.find(r => r.componentId === 'w')!;
    expect(wg.inputPower).toBeLessThan(-50);
  });
});

describe('cycle handling', () => {
  it('ring resonator feedback loop emits cycle warning, does not crash', () => {
    // ring → waveguide → ring creates a cycle
    const layout: CircuitLayout = {
      components: [
        { id: 'l', type: 'laser_source', label: 'L', x: 0, y: 0, params: { power: 10, wavelength: 1550, bandwidth: 0.1 } },
        { id: 'r', type: 'ring_resonator', label: 'Ring', x: 100, y: 0, params: { couplingCoeff: 0.1, loss: 3 } },
        { id: 'w', type: 'waveguide', label: 'Feedback', x: 100, y: 100, params: { alpha: 1, length: 500 } },
        { id: 'd', type: 'photodetector', label: 'D', x: 200, y: 0, params: { responsivity: 0.8 } },
      ],
      connections: [
        { id: 'e1', fromComponentId: 'l', fromPort: 'out', toComponentId: 'r', toPort: 'in' },
        { id: 'e2', fromComponentId: 'r', fromPort: 'through', toComponentId: 'd', toPort: 'in' },
        { id: 'e3', fromComponentId: 'r', fromPort: 'drop', toComponentId: 'w', toPort: 'in' },
        { id: 'e4', fromComponentId: 'w', fromPort: 'out', toComponentId: 'r', toPort: 'in' }, // cycle!
      ],
    };
    const result = runPhotonicsSimulation(layout, 1550);
    expect(result.issues.some(i => i.code === 'FEEDBACK_LOOP')).toBe(true);
    expect(result.converged).toBe(false); // cannot converge with unresolved cycle
  });
});
```

**Step 2: Run — verify failure**

**Step 3: Implement topological sort with cycle detection**

Add before the simulation loop in `photonicsEngine.ts`:

```typescript
function topologicalSort(
  components: CircuitComponent[],
  connections: Connection[],
): { sorted: CircuitComponent[]; cycleNodeIds: Set<string> } {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  components.forEach(c => { inDegree.set(c.id, 0); adjacency.set(c.id, []); });
  connections.forEach(conn => {
    adjacency.get(conn.fromComponentId)?.push(conn.toComponentId);
    inDegree.set(conn.toComponentId, (inDegree.get(conn.toComponentId) ?? 0) + 1);
  });

  const queue: string[] = [];
  inDegree.forEach((deg, id) => { if (deg === 0) queue.push(id); });

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

  // Nodes not in sortedIds are part of cycles
  const sortedSet = new Set(sortedIds);
  const cycleNodeIds = new Set<string>();
  components.forEach(c => { if (!sortedSet.has(c.id)) cycleNodeIds.add(c.id); });

  // Append cycle nodes at end (evaluated with no input signal)
  const allIds = [...sortedIds, ...cycleNodeIds];
  const idToComp = new Map(components.map(c => [c.id, c]));
  return {
    sorted: allIds.map(id => idToComp.get(id)!).filter(Boolean),
    cycleNodeIds,
  };
}
```

Then replace the simulation loop to use `topologicalSort`, compute `inputPower` from upstream `outputPowerMap`, and emit `FEEDBACK_LOOP` warnings for cycle nodes.

**Step 4: Run — verify pass**

**Step 5: Commit**

```bash
git commit -m "feat: topological sort, graph power propagation, cycle detection (I4)"
```

---

### Task 4: dBm/Watts Conversion Tests and Edge Case Hardening

Additional tests for numerical correctness. No new implementation unless tests reveal bugs.

**Step 1: Write tests** (0 dBm = 1 mW round-trip, negative dBm, high power, multi-source power combining)

**Step 2: Run — verify pass (or fix)**

**Step 3: Commit**

```bash
git commit -m "test: add dBm conversion and edge case tests for physics engine"
```

---

## Phase 2: Security Hardening (Before Adding New Endpoints)

Moved earlier per review — fix the security surface before expanding the API.

### Task 5: Fix CORS, JSON Size Limits, Input Validation (C1, C2, C3)

**Files:**
- Modify: `artifacts/api-server/src/app.ts:28-29`
- Modify: `artifacts/api-server/src/routes/builds.ts:20-21, 69`

**Step 1: Lock down CORS and add body limit**

```typescript
// app.ts
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(",") || "*" }));
app.use(express.json({ limit: "1mb" }));
```

**Step 2: Add Zod validation to POST/PUT build routes**

Import `insertBuildSchema` from `@workspace/db` and validate `req.body` before database insertion. Return 400 with Zod error details on validation failure.

**Step 3: Test manually — invalid payloads should return 400**

**Step 4: Commit**

```bash
git commit -m "fix: add CORS origin config, JSON size limit, Zod input validation (C1-C3)"
```

---

### Task 6: Fix DELETE 204 on Missing Build, Add Missing DB Index (I6, I7)

**Files:**
- Modify: `artifacts/api-server/src/routes/builds.ts:90-103`
- Modify: `lib/db/src/schema/photonics.ts`

**Step 1: Check delete result count, return 404 if 0 rows affected**

**Step 2: Add index on `simulationsTable.buildId`**

```typescript
// In photonics.ts, after simulationsTable definition:
import { index } from "drizzle-orm/pg-core";
// Add .index("simulations_build_id_idx") or use a separate index definition
```

**Step 3: Commit**

```bash
git commit -m "fix: DELETE returns 404 for missing builds, add simulations build_id index"
```

---

## Phase 3: Database Schema Migration

### Task 7: Fix `converged` Column + Add ML Tables + Migration

**Files:**
- Modify: `lib/db/src/schema/photonics.ts:69`
- Create: Drizzle migration files
- Modify: `artifacts/api-server/src/routes/builds.ts:139, 152, 170`

**Step 1: Change converged to boolean**

```typescript
// Line 69: change from text("converged") to:
converged: boolean("converged").notNull().default(false),
```

**Step 2: Add ML tables**

```typescript
export const trainingExamplesTable = pgTable("training_examples", {
  id: serial("id").primaryKey(),
  graph: jsonb("graph").notNull(),
  results: jsonb("results").notNull(),
  topology: text("topology").notNull(),
  componentCount: integer("component_count").notNull(),
  source: text("source").notNull().default("synthetic"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const mlModelsTable = pgTable("ml_models", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  version: text("version").notNull(),
  onnxPath: text("onnx_path").notNull(),
  metrics: jsonb("metrics").notNull().$type<Record<string, number>>(),
  active: boolean("active").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

**Step 3: Generate Drizzle migration**

Run: `cd lib/db && pnpm drizzle-kit generate`

**Step 4: Write data migration for existing rows**

```sql
-- Migration: convert existing text converged to boolean
ALTER TABLE simulations ALTER COLUMN converged TYPE boolean USING (converged = 'true');
ALTER TABLE simulations ALTER COLUMN converged SET DEFAULT false;
```

**Step 5: Remove string comparisons in builds.ts**

- Line 139: `converged: simOutput.converged` (remove `.toString()`)
- Line 152: `converged: sim.converged` (remove `=== "true"`)
- Line 170: `res.json(sims)` (remove `.map(s => ...)`)

**Step 6: Commit**

```bash
git commit -m "fix: converged column to boolean (C5), add ML tables with migration"
```

---

## Phase 4: Shared ML Types Library

### Task 8: Create `lib/ml-models` Package (Types + Graph Encoder/Decoder)

**Files:**
- Create: `lib/ml-models/package.json`
- Create: `lib/ml-models/tsconfig.json`
- Create: `lib/ml-models/src/types.ts`
- Create: `lib/ml-models/src/graphEncoder.ts`
- Create: `lib/ml-models/src/graphDecoder.ts`
- Create: `lib/ml-models/src/index.ts`

Key design decisions per review:
- **Component type encoding:** Use `COMPONENT_TYPES` constant from `portSpec.ts` for one-hot indices (not a separate mapping)
- **Parameter normalization:** Use `typicalRange` values from the component library (not hardcoded). For Stage 1, hardcode ranges derived from component library defaults with clear comments.
- **Null parameter imputation:** Use component default values from the physics engine, not zeros. A waveguide with `alpha: 0` is physically different from `alpha: 2.0` (the default).

**Step 1: Create types.ts** — TrainingExample, GraphInput, PredictionOutput, GenerateRequest/Response interfaces

**Step 2: Create graphEncoder.ts** — `encodeNodeFeatures()` (one-hot type + normalized params = 29 floats), `encodeGraph()` (full graph → nodeFeatures + edgeIndex + nodeIds). Include `DEFAULT_PARAMS` constant for null imputation.

**Step 3: Create graphDecoder.ts** — `decodeNodeFeatures()` (vector → GraphNode), `graphToReactFlowFormat()` (GraphInput → ReactFlow nodes/edges)

**Step 4: Create index.ts** — re-export everything + portSpec

**Step 5: Verify types compile**

Run: `pnpm install && cd lib/ml-models && pnpm typecheck`

**Step 6: Commit**

```bash
git commit -m "feat: add @workspace/ml-models with types, graph encoder/decoder, port spec"
```

---

## Phase 5: Training Pipeline (Python)

Split into 4 sub-tasks per review — the original plan compressed 6 work items into 1.

### Task 9a: Python Scaffolding + Circuit Generator + 10K Validation

**Files:**
- Create: `artifacts/training-pipeline/pyproject.toml`
- Create: `artifacts/training-pipeline/src/data_factory/topology_templates.py`
- Create: `artifacts/training-pipeline/src/data_factory/circuit_generator.py`

**Step 1: Create pyproject.toml** with PyTorch, PyG, numpy, pandas, pyarrow, scikit-learn, onnx, onnxruntime, tqdm, matplotlib, requests

**Step 2: Create topology_templates.py** with:
- Port compatibility matrix (imported from portSpec equivalent)
- Parameter ranges per component type
- Templates: `linear_chain`, `mzi_interferometer`, `ring_filter`, `star_coupler`, `cascaded_filters`, `amplified_link` (6 minimum)
- `generate_random_circuit()` — picks template, randomizes params, validates port connections

**Step 3: Create circuit_generator.py** — calls the physics engine API to label circuits, outputs JSONL

**Step 4: Generate and validate 10K circuits**

Run: `python -m src.data_factory.circuit_generator --api-url http://localhost:3000 --num-examples 10000 --output data/validation_10k.jsonl`

Validate: check valid circuit rate > 99%, no NaN/Inf in results, energy conservation (output power ≤ input power for passive-only circuits).

**Step 5: Commit**

```bash
git commit -m "feat: Python training pipeline with circuit generator, 6 topology templates"
```

---

### Task 9b: GNN + Transformer Head Model Definition

**Files:**
- Create: `artifacts/training-pipeline/src/models/forward_gnn.py`

**Step 1: Implement PhotonMPNNLayer** (MessagePassing with GRU aggregation)

**Step 2: Implement SetTransformerHead** (2-layer self-attention over node embeddings for global readout — replaces mean-pool)

```python
class SetTransformerHead(nn.Module):
    """2-layer self-attention for global graph readout.
    Better than mean-pool for equilibrium score — captures global interactions."""
    def __init__(self, hidden_dim: int, num_heads: int = 4):
        super().__init__()
        self.attn1 = nn.MultiheadAttention(hidden_dim, num_heads, batch_first=True)
        self.norm1 = nn.LayerNorm(hidden_dim)
        self.attn2 = nn.MultiheadAttention(hidden_dim, num_heads, batch_first=True)
        self.norm2 = nn.LayerNorm(hidden_dim)
        self.head = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.ReLU(),
            nn.Linear(hidden_dim // 2, NUM_GLOBAL_OUTPUTS),
        )

    def forward(self, x: torch.Tensor, batch: torch.Tensor) -> torch.Tensor:
        # Group by graph, apply self-attention, pool
        # For batched graphs, segment and pad
        ...
```

**Step 3: Implement PhotonicSurrogateGNN** — NodeEncoder → 6 MPNN layers → PerNodeHead + SetTransformerHead

**Step 4: Single-example forward pass test**

```python
# Smoke test
model = PhotonicSurrogateGNN()
dummy = Data(x=torch.randn(5, 29), edge_index=torch.tensor([[0,1,2],[1,2,3]]))
node_out, global_out = model(dummy)
assert node_out.shape == (5, 4)
assert global_out.shape == (1, 4)
```

**Step 5: Commit**

```bash
git commit -m "feat: GNN + Set Transformer head model definition (~2.2M params)"
```

---

### Task 9c: Training Loop + Hyperparameter Sweep

**Files:**
- Create: `artifacts/training-pipeline/src/training/train_surrogate.py`
- Create: `artifacts/training-pipeline/src/evaluation/metrics.py`

**Step 1: Implement data loading** (JSONL → PyG Data objects)

**Step 2: Implement training loop** (MSE for continuous, CE for status, BCE for converged)

**Step 3: Implement evaluation metrics** (MAE per output, R², confusion matrix for status)

**Step 4: Run training on 100K circuits**

Run: `python -m src.training.train_surrogate --data data/training_100k.jsonl --epochs 50`
Target: MAE < 1 dB, R² > 0.95

**Step 5: Run hyperparameter sweep** (learning rate, hidden dim, num layers)

**Step 6: Scale to 500K and retrain**

Target: MAE < 0.5 dB, R² > 0.98

**Step 7: Commit**

```bash
git commit -m "feat: training loop with metrics, validated on 500K circuits"
```

---

### Task 9d: ONNX Export + Numerical Equivalence Tests

**Caveat from review:** PyG's scatter ops (scatter_add, scatter_mean) don't export cleanly to ONNX opset < 16. The forward pass must be rewritten using pure PyTorch ops with ONNX equivalents. Budget 2-3 days for this.

**Files:**
- Create: `artifacts/training-pipeline/src/training/export_onnx.py`
- Create: `artifacts/training-pipeline/tests/test_onnx_equivalence.py`

**Step 1: Rewrite GNN forward pass for ONNX compatibility** — replace scatter operations with index_add or manual aggregation

**Step 2: Export to ONNX**

**Step 3: Numerical equivalence test** — run 100 random circuits through both PyTorch and ONNX, assert max absolute difference < 1e-5

**Step 4: Commit**

```bash
git commit -m "feat: ONNX export with numerical equivalence tests"
```

---

## Phase 6: API Server ML Integration

### Task 10: ONNX Runtime Inference Wrapper

**Files:**
- Create: `artifacts/api-server/src/lib/mlInference.ts`
- Modify: `artifacts/api-server/package.json`

Key additions per review:
- **Model versioning:** Load by version string, support hot-swap via `POST /ml/reload`
- **Graceful degradation:** If ONNX inference fails, fall back to physics engine
- **Warm-up:** Run dummy inference at server startup to avoid cold-start latency spike

**Step 1: Install onnxruntime-node**

**Step 2: Implement wrapper with loadModel, predict, isModelLoaded, warmUp, reloadModel**

**Step 3: Commit**

```bash
git commit -m "feat: ONNX Runtime wrapper with versioning, fallback, warm-up"
```

---

### Task 11: REST /predict Endpoint + OpenAPI Spec Update

**Decision change:** REST instead of WebSocket for Stage 1. The frontend calls `POST /predict` with debounce. Response latency ~10-15ms (5ms inference + network) — indistinguishable from WebSocket for the user. WebSocket added in Stage 2 for generation streaming.

**Files:**
- Create: `artifacts/api-server/src/routes/predict.ts`
- Create: `artifacts/api-server/src/routes/generate.ts` (placeholder)
- Modify: `artifacts/api-server/src/routes/index.ts`
- Modify: `lib/api-spec/openapi.yaml` (add /predict and /generate specs)

**Step 1: Create predict.ts** — POST /predict accepts {nodes, edges}, returns PredictionOutput. Falls back to physics engine if model not loaded.

**Step 2: Create generate.ts** — 501 Not Implemented placeholder

**Step 3: Register routes in index.ts**

**Step 4: Update OpenAPI spec** — add /predict and /generate endpoint definitions with request/response schemas

**Step 5: Regenerate client code**

Run: `cd lib/api-spec && pnpm run codegen`

**Step 6: Commit**

```bash
git commit -m "feat: REST /predict endpoint + OpenAPI spec update + codegen"
```

---

## Phase 7: Frontend Integration

### Task 12: Add ML Predictions to Zustand Store

**Files:**
- Modify: `artifacts/photonics-sim/src/store/use-simulator-store.ts`

Add: `mlPredictions`, `mlMode` ('off' | 'instant' | 'physics'), `setMlPredictions`, `setMlMode`

Also: remove dead `onNodesChange`/`onEdgesChange` stubs (lines 59-66).

**Step 1: Update store**

**Step 2: Commit**

```bash
git commit -m "feat: add ML prediction state to store, remove dead code"
```

---

### Task 13: Debounced Prediction Hook + Canvas Overlay

**Files:**
- Create: `artifacts/photonics-sim/src/hooks/use-ml-predictions.ts`
- Modify: `artifacts/photonics-sim/src/components/canvas/CircuitCanvas.tsx`
- Modify: `artifacts/photonics-sim/src/components/panels/SimulationPanel.tsx`

**Step 1: Create hook** — watches nodes/edges via Zustand, debounces 50ms, calls `POST /predict` via React Query `useMutation`, writes result to store

**Step 2: Canvas overlay** — color-coded power levels on edges (green = strong, yellow = moderate, red = weak), warning/error badges on nodes from ML predictions

**Step 3: SimulationPanel toggle** — "ML Instant" vs "Physics Engine" mode switch

**Step 4: Fix node ID collision** — replace `Date.now()` with `crypto.randomUUID()` in CircuitCanvas.tsx

**Step 5: Extract shared ICON_MAP** — deduplicate from PhotonNode.tsx and ComponentLibrary.tsx

**Step 6: Commit**

```bash
git commit -m "feat: real-time ML prediction overlay, mode toggle, fix node ID collision"
```

---

### Task 14: Inverse Design Panel (Placeholder UI)

**Files:**
- Create: `artifacts/photonics-sim/src/components/panels/InverseDesignPanel.tsx`
- Modify: `artifacts/photonics-sim/src/pages/editor.tsx`

Form: target wavelength, power, SNR, max components, topology hint. Calls `POST /generate` (returns 501 until cVAE is trained). Results render as circuit cards user can click to load into canvas.

**Step 1: Create panel**

**Step 2: Wire into editor as new tab**

**Step 3: Commit**

```bash
git commit -m "feat: inverse design panel placeholder UI"
```

---

## Phase 8: Generative Model (cVAE via Python Sidecar)

**Runtime decision:** The cVAE's autoregressive decoder (variable-length loop: predict num_nodes → iterate) cannot be ONNX-exported as a single model. It runs as a FastAPI sidecar. The Express server proxies `/generate` requests to the sidecar.

### Task 15: cVAE Model + Training

**Files:**
- Create: `artifacts/training-pipeline/src/models/generative_cvae.py`
- Create: `artifacts/training-pipeline/src/training/train_generative.py`

**Step 1: Implement cVAE** — GNN encoder → latent z, autoregressive decoder conditioned on [z ∥ target_specs], validity mask

**Step 2: Train on 500K circuits**

Target: validity rate > 90%, diversity > 0.7

**Step 3: Commit**

```bash
git commit -m "feat: conditional VAE for circuit generation"
```

---

### Task 16: FastAPI Generation Sidecar

**Files:**
- Create: `artifacts/training-pipeline/src/serve/app.py`
- Modify: `artifacts/api-server/src/routes/generate.ts` (proxy to sidecar)

**Step 1: Create FastAPI app** with `POST /generate` endpoint

**Step 2: Wire Express generate.ts to proxy to sidecar** (configurable via `ML_SIDECAR_URL` env var)

**Step 3: Commit**

```bash
git commit -m "feat: FastAPI sidecar for circuit generation, Express proxy"
```

---

## Phase 9: Observability + Active Learning Quality Gates

### Task 17: Inference Metrics + Prediction Monitoring

**Files:**
- Create: `artifacts/api-server/src/lib/mlMetrics.ts`
- Modify: `artifacts/api-server/src/lib/mlInference.ts`
- Modify: `artifacts/api-server/src/routes/predict.ts`

Track:
- P50/P95/P99 inference latency per request
- Prediction-vs-engine divergence when users click "Verify"
- Model confidence distribution over time
- Requests per minute

Expose at `GET /ml/metrics` (Prometheus-compatible or JSON).

**Step 1: Create mlMetrics.ts** — simple in-memory histogram/counter, reset on scrape

**Step 2: Instrument predict route** — log latency, track request count

**Step 3: Commit**

```bash
git commit -m "feat: ML inference observability metrics"
```

---

### Task 18: Active Learning Pipeline with Quality Gates

When a user clicks "Verify with Physics Engine" after viewing ML predictions, the (prediction, ground_truth) pair is a training signal. But if the physics engine has bugs (or the circuit triggers edge cases), bad ground truth gets baked into training data.

**Files:**
- Create: `artifacts/api-server/src/lib/trainingDataCollector.ts`
- Modify: `artifacts/api-server/src/routes/builds.ts` (post-simulation hook)

**Quality gates before saving training example:**
1. Energy conservation: total output power ≤ total input power for passive-only circuits
2. Power monotonicity: each passive component's output ≤ input
3. Coherence length within physical bounds (0.01 mm to 10 km)
4. No NaN/Inf in any result field
5. Equilibrium score in [0, 100]

**Step 1: Create trainingDataCollector.ts** — `collectExample(graph, results)` runs quality gates, saves to `training_examples` table if passes

**Step 2: Hook into simulate route** — after successful simulation, call collector

**Step 3: Commit**

```bash
git commit -m "feat: active learning pipeline with quality gate validation"
```

---

## Task Summary

| # | Task | Phase | Notes |
|---|------|-------|-------|
| 0 | Port specification for 15 component types | 0: Ports | **New** — drives generator + encoder + validation |
| 1 | Add Vitest to API server | 1: Engine | Same |
| 2 | Fix coherence length formula (C4) | 1: Engine | Same |
| 3 | Topological sort + propagation + **cycle handling** | 1: Engine | **Added** cycle detection for ring resonators |
| 4 | Edge case tests | 1: Engine | Same |
| 5 | CORS, JSON limits, Zod validation (C1-C3) | 2: Security | **Moved earlier** — before adding new endpoints |
| 6 | DELETE 404 + DB index (I6, I7) | 2: Security | **Moved earlier** |
| 7 | converged→boolean + ML tables + **migration** | 3: Schema | **Added** explicit Drizzle migration with data transform |
| 8 | lib/ml-models types + encoder/decoder | 4: ML Types | **Enhanced** — null imputation from defaults, not zeros |
| 9a | Python scaffolding + circuit generator + 10K validation | 5: Training | **Split** from original Task 6 |
| 9b | GNN + **Transformer Head** model definition | 5: Training | **Architecture change** — Set Transformer replaces mean-pool |
| 9c | Training loop + hyperparameter sweep | 5: Training | **Split** |
| 9d | ONNX export + **numerical equivalence tests** | 5: Training | **Split** — budgets 2-3 days for scatter op rewrites |
| 10 | ONNX wrapper with **versioning, fallback, warm-up** | 6: API | **Enhanced** error handling |
| 11 | REST /predict + **OpenAPI spec update + codegen** | 6: API | **Changed** WebSocket→REST, **added** spec update |
| 12 | Zustand ML state + remove dead code | 7: Frontend | Same + cleanup |
| 13 | Prediction hook + canvas overlay + icon dedup | 7: Frontend | **Added** node ID fix, ICON_MAP dedup |
| 14 | Inverse design panel placeholder | 7: Frontend | Same |
| 15 | cVAE model + training | 8: Generative | Same |
| 16 | FastAPI sidecar + Express proxy | 8: Generative | **Changed** from ONNX-in-Node to Python sidecar |
| 17 | Inference metrics + monitoring | 9: Observability | **New** |
| 18 | Active learning with quality gates | 9: Observability | **New** |

**Total: 20 tasks across 10 phases**

---

## Stage 1.5 (Future): Diffusion Upgrade for Generative Model

The cVAE is acceptable for proof-of-concept but has known mode collapse risk. Plan to evaluate discrete graph diffusion (DiGress-style) as a replacement. This is independent from Stage 2 (device-level physics) — don't conflate them.

Evaluate when: cVAE validity rate plateaus < 95% or diversity metric drops below 0.6.

## Stage 2 (Future): Device-Level Physics

- Pre-train on jungtaekkim/datasets-nanophotonic-structures
- Add FDTD simulation (MEEP or Lumerical API)
- Train device-level surrogates per component type
- Plug into circuit GNN as differentiable component models
- WebSocket for streaming generation results
