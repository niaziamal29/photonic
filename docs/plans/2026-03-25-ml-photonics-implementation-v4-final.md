# ML Photonics Surrogate & Generative Engine — Implementation Plan v4 (FINAL)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Each task has explicit acceptance criteria — do not mark a task done until every criterion passes.

**Goal:** Build an ML system that instantly predicts photonic circuit performance (GNN+Transformer surrogate) and generates novel circuit topologies from user specs (cVAE → diffusion), integrated into the existing Photonics-Equilibrium monorepo.

**Architecture:** MPNN forward surrogate (6 layers, GRU + Set Transformer head) via ONNX Runtime in Node.js for <5ms inference. cVAE generative model via Python FastAPI sidecar. REST-first (no WebSocket in Stage 1). Synthetic training data from corrected physics engine.

**Tech Stack:** PyTorch + PyG (training) · ONNX Runtime Node.js (forward inference) · FastAPI (generation sidecar) · Express 5 · React 19 + ReactFlow + Zustand · Tailwind CSS v4 · Vitest · Drizzle ORM + PostgreSQL

### v4 Errata (fixes from v3)

| # | Fix | Location |
|---|-----|----------|
| 1 | Beam splitter test: added concrete assertion `expect(bs.outputPower).toBeCloseTo(9.7, 1)` | Task 3 |
| 2 | Validation schema: use custom Zod schema excluding server-only fields (`status`, `equilibriumScore`, `iterationCount`), not raw `insertBuildSchema` which includes them | Task 5 |
| 3 | GNN status output: changed from 1 float to 3 class logits (ok/warning/error). Per-node head output dim is now 6 (power, loss, phase, status×3) not 4 | Task 9b |
| 4 | `runInference()` in mlInference.ts: filled in complete ONNX tensor creation code (was `// ...` placeholder) | Task 10 |
| 5 | Server entry: change `app.listen()` → `http.createServer(app)` + `server.listen()` for future WS support | Task 10 |
| 6 | Dockerfile: `pip install .` not `pip install -e .` (editable mode doesn't work in containers) | Task 16 |
| 7 | Added `supertest` to api-server devDeps for E2E tests | Task 19 |
| 8 | `vitest` already present in ml-models from Task 0. No change needed. | Task 8 |

## Architecture Summary

| Concern | Decision | Rationale |
|---------|----------|-----------|
| Forward surrogate | MPNN (6 layers, GRU) + 2-layer Set Transformer global head | Graph structure + global readout for equilibrium score |
| Forward inference | ONNX Runtime in Node.js (`onnxruntime-node`) | In-process, <5ms, no sidecar for forward path |
| Generative model | cVAE (Stage 1) → DiGress-style discrete diffusion (Stage 1.5) | cVAE is faster to build; diffusion has better diversity |
| Generative runtime | Python FastAPI sidecar | Autoregressive decoder can't be a single ONNX model |
| Real-time prediction | REST `POST /predict` with 50ms debounce | WebSocket deferred to Stage 2 (generation streaming) |
| Training data | Synthetic from corrected physics engine (500K–1M circuits) | Engine must be correct first (Phase 1) |
| API contract | OpenAPI 3.1 + Orval codegen → React Query hooks + Zod | Existing pattern — extend, don't bypass |

**Tech Stack:** PyTorch + PyG (training) · ONNX Runtime Node.js (forward inference) · FastAPI (generation sidecar) · Express 5 · React 19 + ReactFlow + Zustand · Tailwind CSS v4 · Vitest · Drizzle ORM + PostgreSQL

---

## Pre-Flight: Monorepo Orientation

```
Photonics-Equilibrium/
├── artifacts/
│   ├── api-server/         Express API + physics engine (ESBuild)
│   ├── photonics-sim/      React frontend (Vite 7)
│   └── mockup-sandbox/     shadcn/ui sandbox (Vite 7)
├── lib/
│   ├── api-client-react/   Orval-generated React Query hooks + custom fetch
│   ├── api-spec/           OpenAPI 3.1 spec + orval.config.ts
│   ├── api-zod/            Orval-generated Zod schemas
│   ├── db/                 Drizzle schema (builds + simulations tables)
│   └── ml-models/          ✅ Port spec (DONE), types + encoder/decoder (Phase 4)
├── docs/plans/             Design doc, implementation plans, review
└── pnpm-workspace.yaml     Workspace config with catalog deps
```

**Key commands:**
- `pnpm install` — install all workspace deps
- `pnpm --filter api-server dev` — start API on PORT
- `pnpm --filter photonics-sim dev` — start frontend on PORT
- `cd lib/api-spec && pnpm run codegen` — regenerate React Query hooks + Zod schemas
- `cd lib/db && pnpm run push` — push Drizzle schema to DB

**Current state:** 6 commits. No tests in api-server or frontend. Port spec in ml-models has 55 passing tests. Physics engine has 5 critical bugs and 8 important issues documented in `docs/reviews/2026-03-25-system-design-review.md`.

---

## Task Summary

| # | Task | Phase | Est | Depends On | Status |
|---|------|-------|-----|------------|--------|
| 0 | Port specification for all 15 component types | 0: Ports | 1h | — | ✅ DONE |
| 1 | Add Vitest to api-server + skeleton test | 1: Engine | 30m | — | |
| 2 | Fix coherence length formula (C4) | 1: Engine | 30m | 1 | |
| 3 | Topological sort + graph power propagation + cycle detection | 1: Engine | 2h | 1,2 | |
| 4 | Edge case + numerical correctness tests | 1: Engine | 1h | 3 | |
| 5 | Security: helmet, CORS, JSON limit, Zod validation, rate limit | 2: Security | 1.5h | 1 | |
| 6 | DELETE 404 + DB index + dead code cleanup | 2: Cleanup | 30m | 5 | |
| 7 | converged→boolean + ML tables + Drizzle migration | 3: Schema | 1h | 6 | |
| 8 | ml-models types + graph encoder/decoder + param normalization | 4: ML Types | 2h | 0,7 | |
| 9a | Python training pipeline scaffold + circuit generator + 10K validation | 5: Training | 3h | 4,8 | |
| 9b | GNN + Set Transformer model definition | 5: Training | 2h | 9a | |
| 9c | Training loop + eval metrics + hyperparameter sweep | 5: Training | 4h | 9b | |
| 9d | ONNX export + scatter op rewrite + numerical equivalence | 5: Training | 3h | 9c | |
| 10 | ONNX Runtime wrapper (versioning, fallback, warm-up) | 6: API | 1.5h | 9d | |
| 11 | REST /predict + /generate (501) + OpenAPI spec + codegen | 6: API | 2h | 10 | |
| 12 | Zustand ML state + dead code removal | 7: Frontend | 1h | 11 | |
| 13 | Debounced prediction hook + canvas overlay + UI cleanup | 7: Frontend | 3h | 12 | |
| 14 | Inverse design panel (placeholder UI) | 7: Frontend | 1.5h | 12 | |
| 15 | cVAE model + training | 8: Generative | 6h | 9a,9b | |
| 16 | FastAPI sidecar + Express proxy + Docker | 8: Generative | 3h | 15 | |
| 17 | Inference metrics + /ml/metrics endpoint | 9: Observability | 1.5h | 11 | |
| 18 | Active learning pipeline + quality gates | 9: Observability | 2h | 17 | |
| 19 | E2E integration test (predict flow) | 10: Verification | 2h | 13,17 | |

**Total: 23 tasks across 11 phases · ~46 hours estimated**

**Critical path:** Tasks 1→2→3→4 (engine fixes) → 9a→9b→9c→9d (training) → 10→11 (API integration) → 13 (frontend overlay)
**Parallelizable:** Tasks 5-6 (security) can run alongside 8 (ML types). Task 14 (inverse UI) can run alongside 9c-9d. Tasks 15-16 (generative) can start after 9a+9b.

---

## Phase 0: Formal Port Specification ✅ COMPLETE

### Task 0: Define Port Specification for All 15 Component Types ✅

**Status:** DONE — implemented in previous session.

**Files created:**
- `lib/ml-models/src/portSpec.ts` — 15 component types with typed ports (direction, signal domain, descriptions, feedback flag)
- `lib/ml-models/src/index.ts` — barrel exports
- `lib/ml-models/src/__tests__/portSpec.test.ts` — 55 tests passing
- `lib/ml-models/package.json`, `tsconfig.json`, `vitest.config.ts`

**Key exports available for downstream tasks:**
- `PORT_SPECS` — canonical port definitions
- `isConnectionValid()`, `validateCircuitConnections()` — validation (used by Task 5 + Task 9a)
- `ALL_PORT_NAMES`, `PORT_NAME_TO_INDEX`, `PORT_VOCAB_SIZE` — GNN edge encoding (Task 8)
- `COMPONENT_TYPES`, `COMPONENT_TYPE_TO_INDEX`, `NUM_COMPONENT_TYPES` — GNN node encoding (Task 8)
- `getInputPorts()`, `getOutputPorts()`, `getOpticalPorts()` — query helpers

**Port topology (actual implementation):**

| Component | Inputs | Outputs | Notes |
|-----------|--------|---------|-------|
| laser_source | — | out | Source only |
| waveguide | in | out | Pass-through |
| beam_splitter | in | out_1, out_2 | 1→2 splitter |
| coupler | in_1, in_2 | through, cross | 4-port directional coupler |
| modulator | in, electrical(elec) | out | Has electrical RF input |
| photodetector | in | electrical(elec) | Optical→electrical conversion |
| optical_amplifier | in | out | Active gain |
| phase_shifter | in | out | Phase only |
| filter | in | out, drop | Passband + rejected |
| isolator | in | out | Unidirectional |
| circulator | port_1(bidi) | port_2(bidi), port_3(bidi) | 3-port non-reciprocal |
| mzi | in_1, in_2 | out_1, out_2 | 4-port interferometer |
| ring_resonator | in | through, drop | `allowsFeedback: true` |
| grating_coupler | fiber(bidi) | waveguide(bidi) | Fiber↔chip interface |
| mirror | in | reflect, transmit | Partial reflector |

---

## Phase 1: Fix the Physics Engine (Oracle)

The engine must be correct before generating training data. Every simulation result in the database is wrong because power doesn't propagate through the circuit graph.

### Task 1: Add Vitest to the API Server

**Files:**
- Modify: `artifacts/api-server/package.json` — add vitest devDep + test scripts
- Create: `artifacts/api-server/vitest.config.ts`
- Create: `artifacts/api-server/src/lib/__tests__/photonicsEngine.test.ts`

**Steps:**

1. Install vitest:
```bash
pnpm add -D vitest --filter api-server
```

2. Create `artifacts/api-server/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});
```

3. Add scripts to `artifacts/api-server/package.json`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

4. Create skeleton test `artifacts/api-server/src/lib/__tests__/photonicsEngine.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { runPhotonicsSimulation, type CircuitLayout } from '../photonicsEngine.js';

describe('photonicsEngine', () => {
  it('returns empty circuit error for no components', () => {
    const layout: CircuitLayout = { components: [], connections: [] };
    const result = runPhotonicsSimulation(layout, 1550);
    expect(result.issues[0].code).toBe('EMPTY_CIRCUIT');
    expect(result.equilibriumScore).toBe(0);
  });
});
```

5. Run: `cd artifacts/api-server && pnpm test`

**Acceptance criteria:**
- [ ] `pnpm --filter api-server test` passes with 1 test
- [ ] `vitest.config.ts` exists with correct include pattern

**Commit:** `feat: add vitest to api-server with skeleton engine test`

---

### Task 2: Fix Coherence Length Formula (C4)

Both the function definition (line 102–107) and the inline calculation (line 367) are algebraically wrong. The function simplifies to `c² / (Δν² × 1e-6)` — dimensionally nonsensical. Correct: `L_c = c / Δν`.

**Files:**
- Modify: `artifacts/api-server/src/lib/photonicsEngine.ts` (lines 102–107, 367)
- Modify: `artifacts/api-server/src/lib/__tests__/photonicsEngine.test.ts`

**Steps:**

1. Write failing tests:
```typescript
describe('coherence length', () => {
  it('L_c = c/Δν: 0.1 GHz bandwidth → 3000 mm', () => {
    const layout: CircuitLayout = {
      components: [
        { id: 'l', type: 'laser_source', label: 'L', x: 0, y: 0,
          params: { wavelength: 1550, power: 0, bandwidth: 0.1 } },
        { id: 'd', type: 'photodetector', label: 'D', x: 100, y: 0,
          params: { responsivity: 0.8 } },
      ],
      connections: [
        { id: 'e', fromComponentId: 'l', fromPort: 'out', toComponentId: 'd', toPort: 'in' },
      ],
    };
    const result = runPhotonicsSimulation(layout, 1550);
    // c / (0.1e9) = 3e8 / 1e8 = 3 meters = 3000 mm
    expect(result.coherenceLength).toBeCloseTo(3000, 0);
  });

  it('L_c = c/Δν: 10 GHz bandwidth → 30 mm', () => {
    const layout: CircuitLayout = {
      components: [
        { id: 'l', type: 'laser_source', label: 'L', x: 0, y: 0,
          params: { wavelength: 1550, power: 0, bandwidth: 10 } },
      ],
      connections: [],
    };
    const result = runPhotonicsSimulation(layout, 1550);
    expect(result.coherenceLength).toBeCloseTo(30, 0);
  });
});
```

2. Run tests — verify failure.

3. Fix `computeCoherenceLength` (line 102–107):
```typescript
function computeCoherenceLength(wavelength_nm: number, bandwidth_GHz: number): number {
  if (bandwidth_GHz <= 0) return 1e6; // effectively infinite
  const c = 3e8; // m/s
  const delta_nu = bandwidth_GHz * 1e9; // Hz
  return (c / delta_nu) * 1e3; // meters → millimeters
}
```

4. Replace inline calculation (line 367) with function call:
```typescript
const laserBandwidth = lasers[0]?.params?.bandwidth ?? 0.1;
const coherenceLength = computeCoherenceLength(dominantWavelength, laserBandwidth);
```

5. Run tests — verify pass.

**Acceptance criteria:**
- [ ] Both coherence length tests pass
- [ ] `computeCoherenceLength(1550, 0.1)` returns ~3000
- [ ] `computeCoherenceLength(1550, 10)` returns ~30
- [ ] Inline calculation on line 367 replaced with function call

**Commit:** `fix: correct coherence length formula L_c = c/Δν (C4)`

---

### Task 3: Implement Topological Sort + Graph Power Propagation + Cycle Detection (I4)

This is the most consequential fix. The simulation loop iterates components in array order. Every non-source component gets `inputPower = 0`. The `connectionMap` (built on lines 131–135) is constructed but never read. Power never flows through the circuit.

**Strategy:** Kahn's algorithm for topological sort. Components in cycles (ring resonators) get flagged with `FEEDBACK_LOOP` warning and evaluated with `inputPower = -100 dBm`. Iterative convergence for feedback loops is Stage 2.

**Files:**
- Modify: `artifacts/api-server/src/lib/photonicsEngine.ts`
- Modify: `artifacts/api-server/src/lib/__tests__/photonicsEngine.test.ts`

**Steps:**

1. Write failing tests:
```typescript
describe('graph power propagation', () => {
  it('laser 10 dBm → waveguide (2 dB/cm × 1cm) → detector receives 8 dBm', () => {
    const layout: CircuitLayout = {
      components: [
        { id: 'l', type: 'laser_source', label: 'L', x: 0, y: 0,
          params: { wavelength: 1550, power: 10, bandwidth: 0.1 } },
        { id: 'w', type: 'waveguide', label: 'W', x: 100, y: 0,
          params: { alpha: 2.0, length: 10000, neff: 2.4 } },
        { id: 'd', type: 'photodetector', label: 'D', x: 200, y: 0,
          params: { responsivity: 0.8 } },
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

  it('amplifier: 0 dBm + 10 dB gain - 1 dB loss = 9 dBm', () => {
    const layout: CircuitLayout = {
      components: [
        { id: 'l', type: 'laser_source', label: 'L', x: 0, y: 0,
          params: { power: 0, wavelength: 1550, bandwidth: 0.1 } },
        { id: 'a', type: 'optical_amplifier', label: 'A', x: 100, y: 0,
          params: { gain: 10, loss: 1 } },
        { id: 'd', type: 'photodetector', label: 'D', x: 200, y: 0,
          params: { responsivity: 0.8 } },
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

  it('disconnected components get no-signal input', () => {
    const layout: CircuitLayout = {
      components: [
        { id: 'l', type: 'laser_source', label: 'L', x: 0, y: 0,
          params: { power: 10, wavelength: 1550, bandwidth: 0.1 } },
        { id: 'w', type: 'waveguide', label: 'Floating', x: 200, y: 200,
          params: { alpha: 2, length: 1000 } },
      ],
      connections: [],
    };
    const result = runPhotonicsSimulation(layout, 1550);
    const wg = result.componentResults.find(r => r.componentId === 'w')!;
    expect(wg.inputPower).toBeLessThan(-50);
  });

  it('beam splitter distributes power to two outputs', () => {
    const layout: CircuitLayout = {
      components: [
        { id: 'l', type: 'laser_source', label: 'L', x: 0, y: 0,
          params: { power: 10, wavelength: 1550, bandwidth: 0.1 } },
        { id: 'bs', type: 'beam_splitter', label: 'BS', x: 100, y: 0,
          params: { splitRatio: 0.5, loss: 0.3 } },
        { id: 'd1', type: 'photodetector', label: 'D1', x: 200, y: -50,
          params: { responsivity: 0.8 } },
        { id: 'd2', type: 'photodetector', label: 'D2', x: 200, y: 50,
          params: { responsivity: 0.8 } },
      ],
      connections: [
        { id: 'e1', fromComponentId: 'l', fromPort: 'out', toComponentId: 'bs', toPort: 'in' },
        { id: 'e2', fromComponentId: 'bs', fromPort: 'out_1', toComponentId: 'd1', toPort: 'in' },
        { id: 'e3', fromComponentId: 'bs', fromPort: 'out_2', toComponentId: 'd2', toPort: 'in' },
      ],
    };
    const result = runPhotonicsSimulation(layout, 1550);
    const bs = result.componentResults.find(r => r.componentId === 'bs')!;
    expect(bs.inputPower).toBeCloseTo(10, 1);
    // 50:50 split with 0.3 dB insertion loss → 10 - 0.3 = 9.7 dBm total output
    expect(bs.outputPower).toBeCloseTo(9.7, 1);
    // Detector 1 should receive signal from beam splitter
    const d1 = result.componentResults.find(r => r.componentId === 'd1')!;
    expect(d1.inputPower).toBeGreaterThan(-50); // gets signal from splitter
  });
});

describe('cycle handling', () => {
  it('ring resonator feedback loop emits FEEDBACK_LOOP warning', () => {
    const layout: CircuitLayout = {
      components: [
        { id: 'l', type: 'laser_source', label: 'L', x: 0, y: 0,
          params: { power: 10, wavelength: 1550, bandwidth: 0.1 } },
        { id: 'r', type: 'ring_resonator', label: 'Ring', x: 100, y: 0,
          params: { couplingCoeff: 0.1, loss: 3 } },
        { id: 'w', type: 'waveguide', label: 'Feedback', x: 100, y: 100,
          params: { alpha: 1, length: 500 } },
        { id: 'd', type: 'photodetector', label: 'D', x: 200, y: 0,
          params: { responsivity: 0.8 } },
      ],
      connections: [
        { id: 'e1', fromComponentId: 'l', fromPort: 'out', toComponentId: 'r', toPort: 'in' },
        { id: 'e2', fromComponentId: 'r', fromPort: 'through', toComponentId: 'd', toPort: 'in' },
        { id: 'e3', fromComponentId: 'r', fromPort: 'drop', toComponentId: 'w', toPort: 'in' },
        { id: 'e4', fromComponentId: 'w', fromPort: 'out', toComponentId: 'r', toPort: 'in' },
      ],
    };
    const result = runPhotonicsSimulation(layout, 1550);
    expect(result.issues.some(i => i.code === 'FEEDBACK_LOOP')).toBe(true);
    expect(result.converged).toBe(false);
  });
});
```

2. Run tests — verify failure on power propagation.

3. Add `topologicalSort()` function:
```typescript
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
```

4. Rewrite the simulation loop:
```typescript
// Build output power map: componentId → outputPower (dBm)
const outputPowerMap = new Map<string, number>();

// Build connection lookup: toComponentId → fromComponentId[] with their output powers
const incomingConnections = new Map<string, string[]>();
for (const conn of connections) {
  if (!incomingConnections.has(conn.toComponentId)) {
    incomingConnections.set(conn.toComponentId, []);
  }
  incomingConnections.get(conn.toComponentId)!.push(conn.fromComponentId);
}

const { sorted, cycleNodeIds } = topologicalSort(components, connections);

// Emit warnings for cycle nodes
if (cycleNodeIds.size > 0) {
  allIssues.push({
    code: 'FEEDBACK_LOOP',
    severity: 'warning',
    message: `Feedback loop detected involving ${cycleNodeIds.size} component(s): ${[...cycleNodeIds].join(', ')}. Iterative convergence not yet implemented.`,
    suggestion: 'Ring resonator feedback loops will be evaluated without loop gain in this version.',
  });
}

for (const comp of sorted) {
  // ... existing per-component logic, but replace `inputPower = 0` with:
  let inputPower: number;
  if (comp.type === 'laser_source') {
    inputPower = comp.params.power ?? 0;
  } else if (cycleNodeIds.has(comp.id)) {
    inputPower = -100; // no signal for unresolved cycle nodes
  } else {
    // Sum power from all upstream connections (in linear, then convert back)
    const upstreamIds = incomingConnections.get(comp.id) ?? [];
    if (upstreamIds.length === 0) {
      inputPower = -100; // disconnected
    } else if (upstreamIds.length === 1) {
      inputPower = outputPowerMap.get(upstreamIds[0]) ?? -100;
    } else {
      // Multiple inputs: sum in linear domain
      let totalWatts = 0;
      for (const uid of upstreamIds) {
        totalWatts += dBmToWatts(outputPowerMap.get(uid) ?? -100);
      }
      inputPower = totalWatts > 0 ? wattsToDBm(totalWatts) : -100;
    }
  }
  // ... compute outputPower per component type using inputPower ...
  outputPowerMap.set(comp.id, outputPower);
}
```

5. Run tests — verify all pass.

**Acceptance criteria:**
- [ ] `laser → waveguide → detector` test: waveguide receives laser power, detector receives waveguide output
- [ ] `laser → amplifier → detector` test: amplifier applies gain correctly
- [ ] Disconnected component test: input power < -50 dBm
- [ ] Beam splitter distributes power to both outputs
- [ ] Feedback loop test: `FEEDBACK_LOOP` warning emitted, does not crash
- [ ] `outputPowerMap` is populated and read by downstream components

**Commit:** `feat: topological sort, graph power propagation, cycle detection (I4)`

---

### Task 4: Edge Case + Numerical Correctness Tests

Test numerical correctness of dBm/Watts conversions and edge cases. No new implementation unless tests reveal bugs.

**Files:**
- Modify: `artifacts/api-server/src/lib/__tests__/photonicsEngine.test.ts`

**Tests to add:**
```typescript
describe('dBm/Watts correctness', () => {
  it('0 dBm = 1 mW round-trip', () => {
    expect(dBmToWatts(0)).toBeCloseTo(0.001, 6);
    expect(wattsToDBm(0.001)).toBeCloseTo(0, 3);
  });

  it('-30 dBm = 1 μW', () => {
    expect(dBmToWatts(-30)).toBeCloseTo(1e-6, 9);
  });

  it('20 dBm = 100 mW', () => {
    expect(dBmToWatts(20)).toBeCloseTo(0.1, 4);
  });
});

describe('edge cases', () => {
  it('empty circuit returns EMPTY_CIRCUIT', () => { /* ... */ });
  it('laser-only circuit has equilibrium score > 0', () => { /* ... */ });
  it('multi-source circuit combines power', () => { /* ... */ });
  it('very long waveguide has high loss', () => { /* ... */ });
  it('amplifier overcomes waveguide loss', () => { /* ... */ });
});
```

**Acceptance criteria:**
- [ ] All dBm/Watts round-trip tests pass
- [ ] All edge case tests pass (or bugs found and fixed)
- [ ] Export `dBmToWatts` and `wattsToDBm` from photonicsEngine.ts if not already exported

**Commit:** `test: numerical correctness and edge case tests for physics engine`

---

## Phase 2: Security Hardening

Fix the security surface before expanding the API with ML endpoints.

### Task 5: CORS, JSON Limit, Helmet, Zod Validation, Rate Limiting (C1, C2, C3)

**Files:**
- Modify: `artifacts/api-server/package.json` — add helmet, express-rate-limit
- Modify: `artifacts/api-server/src/app.ts`
- Create: `artifacts/api-server/src/middleware/validate.ts`
- Modify: `artifacts/api-server/src/routes/builds.ts`

**Steps:**

1. Install deps:
```bash
pnpm add helmet express-rate-limit --filter api-server
```

2. Update `app.ts`:
```typescript
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

// Security headers
app.use(helmet());

// CORS — configurable origin
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:5173'];
app.use(cors({ origin: allowedOrigins }));

// Body size limit (explicit, not relying on Express default)
app.use(express.json({ limit: '1mb' }));

// Rate limiting — 100 req/min for general, 30 req/min for simulation/predict
const generalLimiter = rateLimit({
  windowMs: 60_000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', generalLimiter);
```

3. Create `artifacts/api-server/src/middleware/validate.ts`:
```typescript
import type { Request, Response, NextFunction } from 'express';
import { type ZodSchema, ZodError } from 'zod';

export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: result.error.flatten().fieldErrors,
      });
    }
    req.body = result.data;
    next();
  };
}
```

4. Apply validation to builds routes. **Important:** `insertBuildSchema` from `@workspace/db` includes server-only fields (`status`, `equilibriumScore`, `iterationCount`) that clients shouldn't set. Create a custom client schema:
```typescript
import { z } from 'zod';
import { validateBody } from '../middleware/validate.js';

const createBuildSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  targetWavelength: z.number().min(400).max(2000).default(1550),
  targetPower: z.number().min(-40).max(30).optional(),
  targetSNR: z.number().min(0).max(100).optional(),
  layout: z.object({
    components: z.array(z.object({
      id: z.string(),
      type: z.string(),
      label: z.string(),
      x: z.number(),
      y: z.number(),
      params: z.record(z.number().optional()),
    })).max(200),
    connections: z.array(z.object({
      id: z.string(),
      fromComponentId: z.string(),
      fromPort: z.string(),
      toComponentId: z.string(),
      toPort: z.string(),
    })).max(500),
  }),
});

// POST /builds
router.post('/', validateBody(createBuildSchema), async (req, res) => { /* ... */ });

// PUT /builds/:id — all fields optional
router.put('/:id', validateBody(createBuildSchema.partial()), async (req, res) => { /* ... */ });
```

5. Add simulation-specific rate limiter:
```typescript
const simulationLimiter = rateLimit({ windowMs: 60_000, max: 30 });
router.post('/:id/simulate', simulationLimiter, async (req, res) => { /* ... */ });
```

**Acceptance criteria:**
- [ ] `helmet` middleware active (verify via response headers: `X-Content-Type-Options`, `Strict-Transport-Security`)
- [ ] CORS configured with explicit origin list
- [ ] `express.json({ limit: '1mb' })` in place
- [ ] POST/PUT builds validate body against Zod schema, return 400 on invalid
- [ ] Rate limiting active on /api (100/min) and /simulate (30/min)
- [ ] Invalid JSON payload returns 400, not 500

**Commit:** `fix: add helmet, CORS, JSON limit, Zod validation, rate limiting (C1-C3)`

---

### Task 6: DELETE 404 + DB Index + Dead Code Cleanup (I5, I6, I7)

**Files:**
- Modify: `artifacts/api-server/src/routes/builds.ts` (DELETE handler)
- Modify: `lib/db/src/schema/photonics.ts` (add index)
- Modify: `artifacts/photonics-sim/src/store/use-simulator-store.ts` (remove dead code)
- Modify: `artifacts/photonics-sim/src/components/canvas/CircuitCanvas.tsx` (fix node ID)
- Create: `artifacts/photonics-sim/src/constants/icons.ts` (deduplicate ICON_MAP)

**Steps:**

1. Fix DELETE to return 404 when build doesn't exist:
```typescript
const result = await db.delete(buildsTable).where(eq(buildsTable.id, buildId)).returning();
if (result.length === 0) {
  return res.status(404).json({ error: 'Build not found' });
}
res.status(204).send();
```

2. Add index on `simulationsTable.buildId`:
```typescript
// In photonics.ts, add import and index
import { index } from 'drizzle-orm/pg-core';

// Add to simulationsTable definition or as separate:
export const simulationsBuildIdIdx = index('simulations_build_id_idx')
  .on(simulationsTable.buildId);
```

3. Remove dead `onNodesChange`/`onEdgesChange` stubs from `use-simulator-store.ts` (lines 59-66).

4. Fix node ID collision in `CircuitCanvas.tsx`:
```typescript
// Replace: id: `node-${Date.now()}`
// With:
id: crypto.randomUUID()
```

5. Extract shared `ICON_MAP` from `PhotonNode.tsx` and `ComponentLibrary.tsx` into `constants/icons.ts`, update both imports.

**Acceptance criteria:**
- [ ] DELETE on nonexistent build returns 404
- [ ] Index defined on `simulationsTable.buildId`
- [ ] Dead store methods removed
- [ ] Node IDs use `crypto.randomUUID()`
- [ ] `ICON_MAP` defined once in `constants/icons.ts`

**Commit:** `fix: DELETE 404, DB index, dead code removal, node ID collision, icon dedup`

---

## Phase 3: Database Schema Migration

### Task 7: Fix `converged` Column + Add ML Tables + Migration (C5)

**Files:**
- Modify: `lib/db/src/schema/photonics.ts` (converged, new tables, index)
- Create: Drizzle migration file
- Modify: `artifacts/api-server/src/routes/builds.ts` (remove string converged)

**Steps:**

1. Change `converged` from text to boolean:
```typescript
converged: boolean("converged").notNull().default(false),
```

2. Add ML tables:
```typescript
export const trainingExamplesTable = pgTable("training_examples", {
  id: serial("id").primaryKey(),
  graph: jsonb("graph").notNull(),
  results: jsonb("results").notNull(),
  topology: text("topology").notNull(),
  componentCount: integer("component_count").notNull(),
  source: text("source").notNull().default("synthetic"),
  qualityScore: doublePrecision("quality_score"), // quality gate score
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const mlModelsTable = pgTable("ml_models", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  version: text("version").notNull(),
  modelType: text("model_type").notNull(), // 'forward_surrogate' | 'generative_cvae'
  onnxPath: text("onnx_path"),
  pythonModule: text("python_module"), // for sidecar models
  metrics: jsonb("metrics").notNull().$type<Record<string, number>>(),
  active: boolean("active").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

3. Generate migration: `cd lib/db && pnpm drizzle-kit generate`

4. Write data migration for existing `converged` rows:
```sql
ALTER TABLE simulations ALTER COLUMN converged TYPE boolean USING (converged = 'true');
ALTER TABLE simulations ALTER COLUMN converged SET DEFAULT false;
```

5. Remove string handling in `builds.ts`:
- Line 139: `converged: simOutput.converged` (remove `.toString()`)
- Line 152: `sim.converged` (remove `=== "true"` comparison)

6. Export new table insert schemas via drizzle-zod.

**Acceptance criteria:**
- [ ] `converged` column is `boolean` type in schema
- [ ] Migration file exists and handles existing text→boolean conversion
- [ ] `trainingExamplesTable` and `mlModelsTable` defined
- [ ] No `.toString()` or `=== "true"` for converged anywhere in routes
- [ ] `drizzle-kit push` runs without errors

**Commit:** `fix: converged→boolean (C5), add ML tables, Drizzle migration`

---

## Phase 4: Shared ML Types Library

### Task 8: Graph Encoder/Decoder + Parameter Normalization

Build on the existing `lib/ml-models` package (Task 0 deliverable) to add types, encoder, decoder, and normalization.

**Files:**
- Create: `lib/ml-models/src/types.ts`
- Create: `lib/ml-models/src/graphEncoder.ts`
- Create: `lib/ml-models/src/graphDecoder.ts`
- Create: `lib/ml-models/src/paramNormalization.ts`
- Modify: `lib/ml-models/src/index.ts`
- Create: `lib/ml-models/src/__tests__/graphEncoder.test.ts`

**Key design decisions:**

1. **Node feature vector:** 15 (one-hot type) + 14 (normalized params) = 29 floats
2. **Parameter normalization:** Use min/max from component library `typicalRange` values (hardcoded for Stage 1 with clear comments referencing source)
3. **Null parameter imputation:** Use default values from physics engine, NOT zeros. `alpha: 0` ≠ `alpha: 2.0` (default).
4. **Edge feature vector:** 2 × `PORT_VOCAB_SIZE` one-hot (fromPort + toPort)

**Steps:**

1. Create `types.ts`:
```typescript
export interface GraphInput {
  nodeFeatures: number[][]; // [N, 29]
  edgeIndex: [number[], number[]]; // COO format
  edgeFeatures?: number[][]; // [E, 2 * PORT_VOCAB_SIZE]
  nodeIds: string[];
}

export interface PredictionOutput {
  nodeOutputs: {
    componentId: string;
    outputPower: number;
    loss: number;
    phase: number;
    status: 'ok' | 'warning' | 'error';
  }[];
  globalOutputs: {
    equilibriumScore: number;
    systemLoss: number;
    totalOutputPower: number;
    snr: number;
  };
  latencyMs: number;
}

export interface GenerateRequest {
  targetWavelength: number;
  targetPower: number;
  targetSNR: number;
  maxComponents: number;
  topologyHint?: string;
}

export interface GenerateResponse {
  circuits: {
    nodes: { id: string; type: string; params: Record<string, number> }[];
    edges: { from: string; fromPort: string; to: string; toPort: string }[];
    predictedScore: number;
  }[];
  latencyMs: number;
}

export interface TrainingExample {
  graph: GraphInput;
  nodeTargets: number[][]; // [N, 4] — power, loss, phase, status
  globalTargets: number[]; // [4] — eqScore, sysLoss, outPower, snr
  metadata: {
    topology: string;
    componentCount: number;
    source: 'synthetic' | 'user_verified';
  };
}
```

2. Create `paramNormalization.ts` with `DEFAULT_PARAMS` and `PARAM_RANGES` derived from the component library:
```typescript
export const DEFAULT_PARAMS: Record<string, Record<string, number>> = {
  laser_source: { wavelength: 1550, power: 0, bandwidth: 0.1 },
  waveguide: { alpha: 2.0, length: 1000, neff: 2.4 },
  beam_splitter: { splitRatio: 0.5, loss: 0.3 },
  // ... all 15 types
};

export const PARAM_RANGES: Record<string, [number, number]> = {
  wavelength: [1260, 1625],
  power: [-40, 30],
  bandwidth: [0.001, 100],
  alpha: [0.1, 20],
  length: [1, 100000],
  // ... all params
};

export function normalizeParam(name: string, value: number): number {
  const [min, max] = PARAM_RANGES[name] ?? [0, 1];
  return (value - min) / (max - min);
}

export function imputeDefault(type: string, paramName: string): number {
  return DEFAULT_PARAMS[type]?.[paramName] ?? 0;
}
```

3. Create `graphEncoder.ts`:
```typescript
import { COMPONENT_TYPE_TO_INDEX, NUM_COMPONENT_TYPES, PORT_NAME_TO_INDEX, PORT_VOCAB_SIZE } from './portSpec.js';
import { normalizeParam, imputeDefault, PARAM_RANGES } from './paramNormalization.js';

const PARAM_NAMES = Object.keys(PARAM_RANGES);

export function encodeNodeFeatures(
  type: string,
  params: Record<string, number | undefined>,
): number[] {
  // One-hot type encoding [15]
  const typeVec = new Array(NUM_COMPONENT_TYPES).fill(0);
  const typeIdx = COMPONENT_TYPE_TO_INDEX.get(type as any);
  if (typeIdx !== undefined) typeVec[typeIdx] = 1;

  // Normalized params [14]
  const paramVec = PARAM_NAMES.map(name => {
    const raw = params[name] ?? imputeDefault(type, name);
    return normalizeParam(name, raw);
  });

  return [...typeVec, ...paramVec];
}

export function encodeGraph(
  components: { id: string; type: string; params: Record<string, any> }[],
  connections: { fromComponentId: string; fromPort: string; toComponentId: string; toPort: string }[],
): GraphInput {
  const nodeIdToIdx = new Map(components.map((c, i) => [c.id, i]));
  const nodeFeatures = components.map(c => encodeNodeFeatures(c.type, c.params));

  const srcIndices: number[] = [];
  const dstIndices: number[] = [];
  const edgeFeatures: number[][] = [];

  for (const conn of connections) {
    const srcIdx = nodeIdToIdx.get(conn.fromComponentId);
    const dstIdx = nodeIdToIdx.get(conn.toComponentId);
    if (srcIdx === undefined || dstIdx === undefined) continue;

    srcIndices.push(srcIdx);
    dstIndices.push(dstIdx);

    // Edge features: one-hot fromPort + one-hot toPort
    const fromOneHot = new Array(PORT_VOCAB_SIZE).fill(0);
    const toOneHot = new Array(PORT_VOCAB_SIZE).fill(0);
    const fromIdx = PORT_NAME_TO_INDEX.get(conn.fromPort);
    const toIdx = PORT_NAME_TO_INDEX.get(conn.toPort);
    if (fromIdx !== undefined) fromOneHot[fromIdx] = 1;
    if (toIdx !== undefined) toOneHot[toIdx] = 1;
    edgeFeatures.push([...fromOneHot, ...toOneHot]);
  }

  return {
    nodeFeatures,
    edgeIndex: [srcIndices, dstIndices],
    edgeFeatures,
    nodeIds: components.map(c => c.id),
  };
}
```

4. Create `graphDecoder.ts` for converting predictions back to UI format.

5. Write tests for encoder: verify dimensions, one-hot correctness, parameter normalization ranges.

**Acceptance criteria:**
- [ ] `encodeNodeFeatures('laser_source', { wavelength: 1550 })` returns 29-element array
- [ ] One-hot type encoding is correct (only one `1` in first 15 elements)
- [ ] Default params are imputed (not zeros) for missing values
- [ ] `encodeGraph()` produces correct COO edge index
- [ ] Edge features include port one-hot encoding
- [ ] All types, interfaces, and functions exported from index.ts
- [ ] Tests pass

**Commit:** `feat: graph encoder/decoder with parameter normalization for GNN training`

---

## Phase 5: Training Pipeline (Python)

Split into 4 sub-tasks. The original plan compressed 6 distinct work items into 1.

### Task 9a: Python Scaffolding + Circuit Generator + 10K Validation

**Files:**
- Create: `artifacts/training-pipeline/pyproject.toml`
- Create: `artifacts/training-pipeline/src/__init__.py`
- Create: `artifacts/training-pipeline/src/data_factory/__init__.py`
- Create: `artifacts/training-pipeline/src/data_factory/topology_templates.py`
- Create: `artifacts/training-pipeline/src/data_factory/circuit_generator.py`
- Create: `artifacts/training-pipeline/src/data_factory/port_spec.py` (mirror of TS port spec)

**Steps:**

1. Create `pyproject.toml`:
```toml
[project]
name = "photonics-training"
version = "0.1.0"
requires-python = ">=3.10"
dependencies = [
    "torch>=2.2",
    "torch-geometric>=2.5",
    "numpy>=1.26",
    "pandas>=2.2",
    "pyarrow>=15.0",
    "scikit-learn>=1.4",
    "onnx>=1.15",
    "onnxruntime>=1.17",
    "requests>=2.31",
    "tqdm>=4.66",
    "matplotlib>=3.8",
]

[project.optional-dependencies]
dev = ["pytest>=8.0", "ruff>=0.3"]
```

2. Create `port_spec.py` — Python mirror of the TS port spec, import-compatible with the generator. Must match the 15 component types and their port definitions exactly.

3. Create `topology_templates.py` with at least 8 templates:
- `linear_chain` — laser → waveguide(s) → detector
- `mzi_interferometer` — laser → splitter → 2 arms → combiner → detector
- `ring_filter` — laser → ring_resonator → detector (with drop)
- `amplified_link` — laser → waveguide → amplifier → waveguide → detector
- `cascaded_filters` — laser → filter → filter → detector
- `star_coupler` — laser → splitter → N detectors
- `isolator_chain` — laser → isolator → amplifier → isolator → detector
- `modulator_link` — laser → modulator → waveguide → detector

Each template: randomizes params within physical ranges, validates port connections, returns `CircuitLayout`.

4. Create `circuit_generator.py`:
- Calls the physics engine API (`POST /builds/:id/simulate`) to label circuits
- Outputs JSONL with graph + simulation results
- Includes validation: reject NaN/Inf, check energy conservation
- CLI: `python -m src.data_factory.circuit_generator --api-url http://localhost:3000 --count 10000 --output data/validation_10k.jsonl`

5. Generate and validate 10K circuits. Check:
- Valid circuit rate > 99%
- No NaN/Inf in results
- Energy conservation: output ≤ input for passive-only circuits

**Acceptance criteria:**
- [ ] `pyproject.toml` installs cleanly with `pip install -e .`
- [ ] Port spec matches TS version (all 15 types, same port names)
- [ ] 8+ topology templates, each generating valid circuits
- [ ] 10K circuits generated with > 99% validity
- [ ] No NaN/Inf in any output field
- [ ] Energy conservation holds for passive-only circuits

**Commit:** `feat: Python training pipeline with circuit generator, 8 topology templates`

---

### Task 9b: GNN + Set Transformer Model Definition

**Files:**
- Create: `artifacts/training-pipeline/src/models/__init__.py`
- Create: `artifacts/training-pipeline/src/models/forward_gnn.py`
- Create: `artifacts/training-pipeline/tests/test_model_shapes.py`

**Architecture:**
- **Node encoder:** Linear(29 → 128)
- **Message passing:** 6 × PhotonMPNNLayer(128, GRU aggregation)
- **Per-node head:** Linear(128 → 64 → 6) predicting [outputPower, loss, phase, status_ok, status_warn, status_error] — status is 3-class logits, apply argmax at inference
- **Global head:** 2-layer Set Transformer(128, 4 heads) → Linear(128 → 64 → 4) predicting [equilibriumScore, systemLoss, totalOutputPower, snr]
- **Total params:** ~2.2M
- **Note:** Per-node output dim is 6, not 4. First 3 are continuous (MSE loss), last 3 are class logits (CrossEntropy loss with target indices 0=ok, 1=warning, 2=error)

**Steps:**

1. Implement `PhotonMPNNLayer(MessagePassing)` with GRU aggregation:
```python
class PhotonMPNNLayer(MessagePassing):
    def __init__(self, hidden_dim: int):
        super().__init__(aggr='add')
        self.message_mlp = nn.Sequential(
            nn.Linear(hidden_dim * 3, hidden_dim),  # src + dst + edge
            nn.ReLU(),
            nn.Linear(hidden_dim, hidden_dim),
        )
        self.gru = nn.GRUCell(hidden_dim, hidden_dim)

    def forward(self, x, edge_index, edge_attr):
        msg = self.propagate(edge_index, x=x, edge_attr=edge_attr)
        return self.gru(msg, x)

    def message(self, x_i, x_j, edge_attr):
        return self.message_mlp(torch.cat([x_i, x_j, edge_attr], dim=-1))
```

2. Implement `SetTransformerHead`:
```python
class SetTransformerHead(nn.Module):
    """2-layer self-attention for global graph readout.
    Better than mean-pool: captures global interactions for equilibrium scoring."""
    def __init__(self, hidden_dim: int, num_heads: int = 4, num_outputs: int = 4):
        super().__init__()
        self.attn1 = nn.MultiheadAttention(hidden_dim, num_heads, batch_first=True)
        self.norm1 = nn.LayerNorm(hidden_dim)
        self.attn2 = nn.MultiheadAttention(hidden_dim, num_heads, batch_first=True)
        self.norm2 = nn.LayerNorm(hidden_dim)
        self.pool_token = nn.Parameter(torch.randn(1, 1, hidden_dim))
        self.head = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.ReLU(),
            nn.Linear(hidden_dim // 2, num_outputs),
        )

    def forward(self, x: Tensor, batch: Tensor) -> Tensor:
        # x: [total_nodes, hidden_dim], batch: [total_nodes]
        # Group by graph, apply self-attention with pool token
        batch_size = batch.max().item() + 1
        outputs = []
        for b in range(batch_size):
            mask = batch == b
            nodes = x[mask].unsqueeze(0)  # [1, n_nodes, hidden_dim]
            pool = self.pool_token.expand(1, -1, -1)  # [1, 1, hidden_dim]
            seq = torch.cat([pool, nodes], dim=1)  # [1, 1+n, hidden_dim]
            attn_out, _ = self.attn1(seq, seq, seq)
            seq = self.norm1(seq + attn_out)
            attn_out, _ = self.attn2(seq, seq, seq)
            seq = self.norm2(seq + attn_out)
            outputs.append(seq[:, 0, :])  # pool token output
        pooled = torch.cat(outputs, dim=0)  # [batch_size, hidden_dim]
        return self.head(pooled)
```

3. Implement `PhotonicsSurrogateGNN` combining all parts.

4. Write shape tests:
```python
def test_forward_pass_shapes():
    model = PhotonicsSurrogateGNN()
    data = Data(
        x=torch.randn(5, 29),
        edge_index=torch.tensor([[0,1,2,3], [1,2,3,4]]),
        edge_attr=torch.randn(4, EDGE_DIM),
        batch=torch.zeros(5, dtype=torch.long),
    )
    node_out, global_out = model(data)
    assert node_out.shape == (5, 6)  # 3 continuous + 3 status logits
    assert global_out.shape == (1, 4)
```

**Acceptance criteria:**
- [ ] Model instantiates with ~2.2M params
- [ ] Forward pass produces correct output shapes: node [N, 6], global [B, 4]
- [ ] No NaN in outputs for random inputs
- [ ] GRU aggregation in message passing works
- [ ] Set Transformer head produces [batch, 4] global outputs

**Commit:** `feat: GNN + Set Transformer head model definition (~2.2M params)`

---

### Task 9c: Training Loop + Evaluation Metrics + Hyperparameter Sweep

**Files:**
- Create: `artifacts/training-pipeline/src/training/__init__.py`
- Create: `artifacts/training-pipeline/src/training/train_surrogate.py`
- Create: `artifacts/training-pipeline/src/training/dataset.py`
- Create: `artifacts/training-pipeline/src/evaluation/__init__.py`
- Create: `artifacts/training-pipeline/src/evaluation/metrics.py`

**Steps:**

1. Implement `PhotonicsDataset(InMemoryDataset)` — loads JSONL → PyG Data objects.

2. Implement training loop:
- Loss: MSE for continuous outputs (power, loss, phase, score) + BCE for converged + CE for status
- Optimizer: AdamW with cosine LR schedule
- Gradient clipping at 1.0
- Train/val/test split: 80/10/10

3. Implement evaluation:
- MAE per output field
- R² per continuous output
- Confusion matrix for status classification
- Energy conservation violation rate

4. Train on 100K circuits (50 epochs). Target: MAE < 1 dB, R² > 0.95.

5. Run hyperparameter sweep: learning rate {1e-4, 3e-4, 1e-3}, hidden dim {64, 128, 256}, num MPNN layers {4, 6, 8}.

6. Retrain best config on 500K circuits. Target: MAE < 0.5 dB, R² > 0.98.

**Acceptance criteria:**
- [ ] Training completes without OOM or NaN loss
- [ ] Validation loss decreases over epochs
- [ ] MAE < 1 dB on 100K test set
- [ ] R² > 0.95 on 100K test set
- [ ] Hyperparameter sweep results logged
- [ ] Best model saved as checkpoint

**Commit:** `feat: training loop with evaluation metrics, validated on 500K circuits`

---

### Task 9d: ONNX Export + Scatter Op Rewrite + Numerical Equivalence Tests

**Caveat:** PyG's scatter ops (scatter_add, scatter_mean) don't export cleanly to ONNX opset < 16. The forward pass must be rewritten using pure PyTorch ops. Budget 2-3 days.

**Files:**
- Create: `artifacts/training-pipeline/src/models/forward_gnn_onnx.py`
- Create: `artifacts/training-pipeline/src/training/export_onnx.py`
- Create: `artifacts/training-pipeline/tests/test_onnx_equivalence.py`

**Steps:**

1. Create ONNX-compatible forward pass in `forward_gnn_onnx.py`:
- Replace `MessagePassing.propagate()` with manual edge gathering + `index_add_`
- Replace scatter operations with `torch.zeros().index_add_()`
- Replace Set Transformer batched loop with padded tensor + attention mask

2. Load trained weights into ONNX-compatible model, verify identical outputs on 10 random circuits.

3. Export to ONNX:
```python
torch.onnx.export(
    model_onnx, dummy_input,
    "models/forward_surrogate_v1.onnx",
    opset_version=16,
    input_names=['node_features', 'edge_index', 'edge_features', 'batch'],
    output_names=['node_outputs', 'global_outputs'],
    dynamic_axes={
        'node_features': {0: 'num_nodes'},
        'edge_index': {1: 'num_edges'},
        'edge_features': {0: 'num_edges'},
        'batch': {0: 'num_nodes'},
    },
)
```

4. Numerical equivalence test: 100 random circuits through both PyTorch and ONNX Runtime, max absolute difference < 1e-5.

**Acceptance criteria:**
- [ ] ONNX model exports without errors
- [ ] ONNX file size < 20 MB
- [ ] Numerical equivalence: max abs diff < 1e-5 across 100 circuits
- [ ] ONNX Runtime inference succeeds with dynamic shapes
- [ ] ONNX model has dynamic axes for variable-size circuits

**Commit:** `feat: ONNX export with scatter op rewrite and numerical equivalence tests`

---

## Phase 6: API Server ML Integration

### Task 10: ONNX Runtime Inference Wrapper

**Files:**
- Create: `artifacts/api-server/src/lib/mlInference.ts`
- Modify: `artifacts/api-server/package.json`
- Modify: `artifacts/api-server/src/index.ts` (warm-up on startup)

**Steps:**

1. Install: `pnpm add onnxruntime-node --filter api-server`

2. Implement `mlInference.ts`:
```typescript
import { InferenceSession, Tensor } from 'onnxruntime-node';
import { encodeGraph, type GraphInput, type PredictionOutput } from '@workspace/ml-models';
import { runPhotonicsSimulation, type CircuitLayout } from './photonicsEngine.js';
import { logger } from './logger.js';

interface ModelState {
  session: InferenceSession | null;
  version: string;
  loadedAt: Date | null;
  warmUp: boolean;
}

const state: ModelState = {
  session: null,
  version: 'none',
  loadedAt: null,
  warmUp: false,
};

export async function loadModel(onnxPath: string, version: string): Promise<void> {
  const session = await InferenceSession.create(onnxPath, {
    executionProviders: ['cpu'],
    graphOptimizationLevel: 'all',
  });
  state.session = session;
  state.version = version;
  state.loadedAt = new Date();
  state.warmUp = false;
  logger.info({ version, path: onnxPath }, 'ML model loaded');
}

export async function warmUp(): Promise<void> {
  if (!state.session || state.warmUp) return;
  // Run dummy inference to trigger ONNX Runtime JIT
  const dummy: GraphInput = {
    nodeFeatures: [[...new Array(29).fill(0)]],
    edgeIndex: [[], []],
    nodeIds: ['dummy'],
  };
  await runInference(dummy);
  state.warmUp = true;
  logger.info('ML model warm-up complete');
}

export async function predict(
  layout: CircuitLayout,
  wavelength: number,
): Promise<PredictionOutput> {
  const start = performance.now();

  if (!state.session) {
    // Fallback to physics engine
    logger.warn('ML model not loaded, falling back to physics engine');
    return physicsEngineFallback(layout, wavelength, start);
  }

  try {
    const graph = encodeGraph(layout.components, layout.connections);
    const result = await runInference(graph);
    result.latencyMs = performance.now() - start;
    return result;
  } catch (err) {
    logger.error({ err }, 'ML inference failed, falling back to physics engine');
    return physicsEngineFallback(layout, wavelength, start);
  }
}

async function runInference(graph: GraphInput): Promise<PredictionOutput> {
  const { nodeFeatures, edgeIndex, edgeFeatures, nodeIds } = graph;
  const N = nodeFeatures.length;
  const E = edgeIndex[0].length;
  const nodeDim = nodeFeatures[0]?.length ?? 29;
  const edgeDim = edgeFeatures?.[0]?.length ?? 0;

  const xData = new Float32Array(nodeFeatures.flat());
  const edgeData = new BigInt64Array(
    [...edgeIndex[0], ...edgeIndex[1]].map(BigInt)
  );
  const batchData = new BigInt64Array(N).fill(0n);

  const feeds: Record<string, Tensor> = {
    node_features: new Tensor('float32', xData, [N, nodeDim]),
    edge_index: new Tensor('int64', edgeData, [2, E]),
    batch: new Tensor('int64', batchData, [N]),
  };
  if (edgeFeatures && edgeDim > 0) {
    feeds.edge_features = new Tensor('float32', new Float32Array(edgeFeatures.flat()), [E, edgeDim]);
  }

  const outputs = await state.session!.run(feeds);
  const nodeOut = outputs.node_outputs.data as Float32Array;  // [N, 6]
  const globalOut = outputs.global_outputs.data as Float32Array; // [1, 4]

  const statusLabels: Array<'ok' | 'warning' | 'error'> = ['ok', 'warning', 'error'];

  return {
    nodeOutputs: nodeIds.map((id, i) => {
      const base = i * 6;
      const statusLogits = [nodeOut[base + 3], nodeOut[base + 4], nodeOut[base + 5]];
      const statusIdx = statusLogits.indexOf(Math.max(...statusLogits));
      return {
        componentId: id,
        outputPower: nodeOut[base],
        loss: nodeOut[base + 1],
        phase: nodeOut[base + 2],
        status: statusLabels[statusIdx] ?? 'ok',
      };
    }),
    globalOutputs: {
      equilibriumScore: globalOut[0],
      systemLoss: globalOut[1],
      totalOutputPower: globalOut[2],
      snr: globalOut[3],
    },
    latencyMs: 0, // filled by caller
  };
}

function physicsEngineFallback(
  layout: CircuitLayout, wavelength: number, start: number,
): PredictionOutput {
  const sim = runPhotonicsSimulation(layout, wavelength);
  // Map simulation output to PredictionOutput format
  return { /* ... */ latencyMs: performance.now() - start };
}

export function getModelStatus() {
  return {
    loaded: state.session !== null,
    version: state.version,
    loadedAt: state.loadedAt,
    warmUp: state.warmUp,
  };
}

export async function reloadModel(onnxPath: string, version: string): Promise<void> {
  await loadModel(onnxPath, version);
  await warmUp();
}
```

3. Rewrite `artifacts/api-server/src/index.ts` to use `http.createServer()` (needed for future WebSocket support) and add warm-up:
```typescript
import { createServer } from "http";
import app from "./app.js";
import { loadModel, warmUp } from "./lib/mlInference.js";
import { logger } from "./lib/logger.js";

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required");
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${rawPort}"`);

const server = createServer(app);

server.listen(port, "0.0.0.0", () => {
  logger.info({ port }, "Server listening");

  // Non-blocking: load ML model if configured
  if (process.env.ML_MODEL_PATH) {
    loadModel(process.env.ML_MODEL_PATH, process.env.ML_MODEL_VERSION ?? 'v1')
      .then(() => warmUp())
      .then(() => logger.info('ML model ready'))
      .catch(err => logger.warn({ err }, 'ML model not loaded — physics engine only'));
  }
});
```
**Note:** This replaces the current `app.listen()` pattern. The `server` object is also needed for WebSocket attachment in Stage 2.

**Acceptance criteria:**
- [ ] `loadModel()` loads ONNX file, `warmUp()` runs dummy inference
- [ ] `predict()` returns PredictionOutput with latencyMs
- [ ] Falls back to physics engine when model not loaded
- [ ] Falls back to physics engine when inference throws
- [ ] `getModelStatus()` returns current state
- [ ] `reloadModel()` supports hot-swap
- [ ] Warm-up at startup (non-blocking, doesn't crash if no model)

**Commit:** `feat: ONNX Runtime inference wrapper with versioning, fallback, warm-up`

---

### Task 11: REST /predict + /generate Placeholder + OpenAPI Spec + Codegen

**Files:**
- Create: `artifacts/api-server/src/routes/predict.ts`
- Create: `artifacts/api-server/src/routes/generate.ts`
- Create: `artifacts/api-server/src/routes/mlStatus.ts`
- Modify: `artifacts/api-server/src/routes/index.ts`
- Modify: `lib/api-spec/openapi.yaml`

**Steps:**

1. Create `predict.ts`:
```typescript
import { Router } from 'express';
import { predict } from '../lib/mlInference.js';
import { validateBody } from '../middleware/validate.js';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';

const router = Router();

const predictSchema = z.object({
  components: z.array(z.object({
    id: z.string(),
    type: z.string(),
    label: z.string(),
    x: z.number(),
    y: z.number(),
    params: z.record(z.number().optional()),
  })),
  connections: z.array(z.object({
    id: z.string(),
    fromComponentId: z.string(),
    fromPort: z.string(),
    toComponentId: z.string(),
    toPort: z.string(),
  })),
  wavelength: z.number().default(1550),
});

const predictLimiter = rateLimit({ windowMs: 60_000, max: 120 });

router.post('/', predictLimiter, validateBody(predictSchema), async (req, res) => {
  const { components, connections, wavelength } = req.body;
  const result = await predict({ components, connections }, wavelength);
  res.json(result);
});

export default router;
```

2. Create `generate.ts` — returns 501 Not Implemented:
```typescript
router.post('/', (req, res) => {
  res.status(501).json({
    error: 'Generation not yet implemented',
    message: 'The generative model (cVAE) is not yet trained. This endpoint will be available after Phase 8.',
  });
});
```

3. Create `mlStatus.ts`:
```typescript
router.get('/', (req, res) => {
  res.json(getModelStatus());
});

router.post('/reload', async (req, res) => {
  const { path, version } = req.body;
  await reloadModel(path, version);
  res.json(getModelStatus());
});
```

4. Register routes in `index.ts`:
```typescript
router.use('/predict', predictRouter);
router.use('/generate', generateRouter);
router.use('/ml', mlStatusRouter);
```

5. Update `lib/api-spec/openapi.yaml` — add `/predict`, `/generate`, `/ml/status`, `/ml/reload` endpoint definitions.

6. Regenerate client code: `cd lib/api-spec && pnpm run codegen`

**Acceptance criteria:**
- [ ] `POST /api/predict` accepts circuit layout, returns PredictionOutput
- [ ] `POST /api/generate` returns 501
- [ ] `GET /api/ml` returns model status
- [ ] `POST /api/ml/reload` hot-swaps model
- [ ] OpenAPI spec updated with new endpoints
- [ ] Generated React Query hooks exist for `/predict` and `/ml`
- [ ] Rate limiting on /predict (120/min)
- [ ] Zod validation on /predict body

**Commit:** `feat: REST /predict + /generate(501) + ML status endpoints + OpenAPI codegen`

---

## Phase 7: Frontend Integration

### Task 12: Add ML Predictions to Zustand Store

**Files:**
- Modify: `artifacts/photonics-sim/src/store/use-simulator-store.ts`

**Steps:**

1. Add ML state fields:
```typescript
// New state
mlPredictions: PredictionOutput | null;
mlMode: 'off' | 'instant' | 'physics'; // off = no ML, instant = ML predict, physics = full engine
mlModelStatus: { loaded: boolean; version: string } | null;

// New actions
setMlPredictions: (predictions: PredictionOutput | null) => void;
setMlMode: (mode: 'off' | 'instant' | 'physics') => void;
setMlModelStatus: (status: { loaded: boolean; version: string } | null) => void;
```

2. Remove dead `onNodesChange`/`onEdgesChange` stubs (lines 59-66) — already handled in Task 6 but verify.

**Acceptance criteria:**
- [ ] Store has `mlPredictions`, `mlMode`, `mlModelStatus` fields
- [ ] Default `mlMode` is `'off'`
- [ ] Actions update state correctly
- [ ] Dead code removed

**Commit:** `feat: add ML prediction state to Zustand store`

---

### Task 13: Debounced Prediction Hook + Canvas Overlay + UI Cleanup

**Files:**
- Create: `artifacts/photonics-sim/src/hooks/useMlPredictions.ts`
- Modify: `artifacts/photonics-sim/src/components/canvas/CircuitCanvas.tsx`
- Modify: `artifacts/photonics-sim/src/components/panels/SimulationPanel.tsx`

**Steps:**

1. Create debounced prediction hook:
```typescript
import { useEffect, useRef, useCallback } from 'react';
import { useSimulatorStore } from '../store/use-simulator-store.js';
import { usePredict } from '@workspace/api-client-react'; // generated

export function useMlPredictions() {
  const nodes = useSimulatorStore(s => s.nodes);
  const edges = useSimulatorStore(s => s.edges);
  const mlMode = useSimulatorStore(s => s.mlMode);
  const setMlPredictions = useSimulatorStore(s => s.setMlPredictions);
  const { mutate: predict } = usePredict();
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const debouncedPredict = useCallback(() => {
    if (mlMode !== 'instant' || nodes.length === 0) return;

    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      const layout = convertReactFlowToLayout(nodes, edges);
      predict(
        { data: { components: layout.components, connections: layout.connections } },
        { onSuccess: (data) => setMlPredictions(data) },
      );
    }, 50); // 50ms debounce
  }, [nodes, edges, mlMode, predict, setMlPredictions]);

  useEffect(() => {
    debouncedPredict();
    return () => clearTimeout(timeoutRef.current);
  }, [debouncedPredict]);
}
```

2. Add canvas overlay — color-coded power levels on edges, warning badges on nodes from ML predictions.

3. Add ML mode toggle in `SimulationPanel.tsx`:
```typescript
<ToggleGroup type="single" value={mlMode} onValueChange={setMlMode}>
  <ToggleGroupItem value="off">Off</ToggleGroupItem>
  <ToggleGroupItem value="instant">ML Instant</ToggleGroupItem>
  <ToggleGroupItem value="physics">Physics</ToggleGroupItem>
</ToggleGroup>
```

**Acceptance criteria:**
- [ ] Hook debounces at 50ms
- [ ] Predictions update in real-time as nodes/edges change
- [ ] Canvas shows power level overlays when mlMode is 'instant'
- [ ] Mode toggle works in SimulationPanel
- [ ] No predictions fire when mlMode is 'off'

**Commit:** `feat: real-time ML prediction overlay with mode toggle`

---

### Task 14: Inverse Design Panel (Placeholder UI)

**Files:**
- Create: `artifacts/photonics-sim/src/components/panels/InverseDesignPanel.tsx`
- Modify: `artifacts/photonics-sim/src/pages/editor.tsx`

**Steps:**

1. Create panel with form: target wavelength, power, SNR, max components, topology hint dropdown.

2. Submit calls `POST /generate` (returns 501 until cVAE trained).

3. Results area shows circuit cards user can click to load into canvas.

4. Wire into editor as new tab alongside Properties/Diagnostics.

**Acceptance criteria:**
- [ ] Form renders with all fields
- [ ] Submit shows "Not yet available" message (501 response)
- [ ] Panel accessible via editor tab
- [ ] Loading state during request

**Commit:** `feat: inverse design panel placeholder UI`

---

## Phase 8: Generative Model (cVAE via Python Sidecar)

### Task 15: cVAE Model + Training

**Files:**
- Create: `artifacts/training-pipeline/src/models/generative_cvae.py`
- Create: `artifacts/training-pipeline/src/training/train_generative.py`

**Architecture:**
- **Encoder:** GNN (shared MPNN layers from forward model) → latent z
- **Decoder:** Autoregressive — predict num_nodes → predict types (one at a time) → predict edges with validity mask
- **Conditioning:** [z ∥ target_wavelength ∥ target_power ∥ target_snr ∥ max_components]
- **Loss:** Reconstruction + β-KL (β annealed 0→1 over 20 epochs to avoid posterior collapse)

**Acceptance criteria:**
- [ ] cVAE generates syntactically valid circuits (pass port spec validation)
- [ ] Validity rate > 90% on held-out conditions
- [ ] Diversity > 0.7 (unique graphs / total generated)
- [ ] Training loss converges

**Commit:** `feat: conditional VAE for circuit generation`

---

### Task 16: FastAPI Sidecar + Express Proxy + Docker

**Files:**
- Create: `artifacts/training-pipeline/src/serve/__init__.py`
- Create: `artifacts/training-pipeline/src/serve/app.py`
- Create: `artifacts/training-pipeline/Dockerfile`
- Create: `docker-compose.yml` (root level)
- Modify: `artifacts/api-server/src/routes/generate.ts` (proxy to sidecar)

**Steps:**

1. Create FastAPI app:
```python
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Photonics Generation Sidecar")

class GenerateRequest(BaseModel):
    target_wavelength: float = 1550.0
    target_power: float = 0.0
    target_snr: float = 20.0
    max_components: int = 10
    topology_hint: str | None = None
    num_results: int = 5

@app.post("/generate")
async def generate(req: GenerateRequest):
    # Load cVAE, generate circuits, validate, return top-N
    ...

@app.get("/health")
async def health():
    return {"status": "ok", "model_loaded": model is not None}
```

2. Create `Dockerfile`:
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY pyproject.toml .
RUN pip install .
COPY src/ src/
COPY models/ models/
CMD ["uvicorn", "src.serve.app:app", "--host", "0.0.0.0", "--port", "8000"]
```

3. Create `docker-compose.yml`:
```yaml
services:
  api:
    build: ./artifacts/api-server
    ports: ["3000:3000"]
    environment:
      - ML_MODEL_PATH=./models/forward_surrogate_v1.onnx
      - ML_SIDECAR_URL=http://sidecar:8000
  sidecar:
    build: ./artifacts/training-pipeline
    ports: ["8000:8000"]
    volumes:
      - ./artifacts/training-pipeline/models:/app/models
```

4. Update `generate.ts` to proxy to sidecar:
```typescript
const SIDECAR_URL = process.env.ML_SIDECAR_URL ?? 'http://localhost:8000';

router.post('/', async (req, res) => {
  try {
    const response = await fetch(`${SIDECAR_URL}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    if (!response.ok) throw new Error(`Sidecar returned ${response.status}`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(503).json({ error: 'Generation service unavailable' });
  }
});
```

**Acceptance criteria:**
- [ ] FastAPI sidecar starts and serves `/generate`
- [ ] Dockerfile builds and runs
- [ ] docker-compose brings up both services
- [ ] Express proxies to sidecar correctly
- [ ] Returns 503 when sidecar is down (not 500)

**Commit:** `feat: FastAPI generation sidecar + Express proxy + Docker`

---

## Phase 9: Observability + Active Learning

### Task 17: Inference Metrics + /ml/metrics Endpoint

**Files:**
- Create: `artifacts/api-server/src/lib/mlMetrics.ts`
- Modify: `artifacts/api-server/src/lib/mlInference.ts`
- Modify: `artifacts/api-server/src/routes/mlStatus.ts`

**Metrics tracked:**
- P50/P95/P99 inference latency
- Requests per minute
- Prediction-vs-engine divergence (when user clicks "Verify")
- Model confidence distribution
- Fallback count (times physics engine used as fallback)

**Steps:**

1. Create `mlMetrics.ts` — in-memory histogram/counter with reset-on-scrape:
```typescript
export class MetricsCollector {
  private latencies: number[] = [];
  private requestCount = 0;
  private fallbackCount = 0;
  private divergences: number[] = [];

  recordLatency(ms: number) { this.latencies.push(ms); this.requestCount++; }
  recordFallback() { this.fallbackCount++; }
  recordDivergence(maeDb: number) { this.divergences.push(maeDb); }

  snapshot() {
    const sorted = [...this.latencies].sort((a, b) => a - b);
    return {
      requestCount: this.requestCount,
      fallbackCount: this.fallbackCount,
      latency: {
        p50: percentile(sorted, 0.5),
        p95: percentile(sorted, 0.95),
        p99: percentile(sorted, 0.99),
      },
      divergence: {
        mean: mean(this.divergences),
        max: Math.max(...this.divergences, 0),
        count: this.divergences.length,
      },
    };
  }
}
```

2. Expose at `GET /api/ml/metrics`.

3. Instrument `predict()` in `mlInference.ts` to record latency and fallback events.

**Acceptance criteria:**
- [ ] `/api/ml/metrics` returns JSON with latency percentiles
- [ ] Latency recorded for every prediction
- [ ] Fallback count tracked
- [ ] Divergence recorded when user verifies with physics engine

**Commit:** `feat: ML inference observability metrics`

---

### Task 18: Active Learning Pipeline + Quality Gates

**Files:**
- Create: `artifacts/api-server/src/lib/trainingDataCollector.ts`
- Modify: `artifacts/api-server/src/routes/builds.ts` (post-simulation hook)

**Quality gates (all must pass to save a training example):**
1. Energy conservation: total output ≤ total input for passive-only circuits
2. Power monotonicity: each passive component's output ≤ input
3. Coherence length in [0.01 mm, 10 km]
4. No NaN/Inf in any result field
5. Equilibrium score in [0, 100]
6. Component count in [2, 100]

**Steps:**

1. Create `trainingDataCollector.ts`:
```typescript
export function collectExample(
  layout: CircuitLayout,
  results: SimulationOutput,
): { accepted: boolean; reason?: string } {
  // Run quality gates
  if (hasNanOrInf(results)) return { accepted: false, reason: 'NaN/Inf in results' };
  if (!energyConserved(layout, results)) return { accepted: false, reason: 'Energy conservation violated' };
  if (!powerMonotonic(layout, results)) return { accepted: false, reason: 'Power monotonicity violated' };
  if (results.coherenceLength < 0.01 || results.coherenceLength > 1e7) {
    return { accepted: false, reason: 'Coherence length out of bounds' };
  }
  if (results.equilibriumScore < 0 || results.equilibriumScore > 100) {
    return { accepted: false, reason: 'Equilibrium score out of bounds' };
  }

  // Encode and save
  const graph = encodeGraph(layout.components, layout.connections);
  // Save to training_examples table
  return { accepted: true };
}
```

2. Hook into simulate route — after successful simulation, call `collectExample`.

**Acceptance criteria:**
- [ ] Quality gates reject NaN/Inf results
- [ ] Quality gates reject energy conservation violations
- [ ] Quality gates reject out-of-bounds values
- [ ] Accepted examples saved to `training_examples` table
- [ ] Hook runs after every simulation (non-blocking)

**Commit:** `feat: active learning pipeline with quality gate validation`

---

## Phase 10: Verification

### Task 19: E2E Integration Test (Full Predict Flow)

**Prerequisites:** `pnpm add -D supertest @types/supertest --filter api-server`

**Files:**
- Create: `artifacts/api-server/src/__tests__/e2e/predict.test.ts`

**Test flow:**
1. Start API server (or use supertest)
2. Create a build with known circuit layout
3. POST /predict — verify response shape and reasonable values
4. POST /builds/:id/simulate — verify full physics simulation
5. Compare ML prediction to physics result — log divergence
6. Verify training data collector was called
7. GET /ml/metrics — verify metrics recorded

**Acceptance criteria:**
- [ ] Full predict flow works end-to-end
- [ ] Prediction and simulation produce structurally valid outputs
- [ ] Metrics endpoint reflects the test traffic
- [ ] No uncaught exceptions

**Commit:** `test: e2e integration test for predict flow`

---

## Future: Stage 1.5 — Diffusion Upgrade

Evaluate discrete graph diffusion (DiGress-style) when:
- cVAE validity rate plateaus < 95%
- Diversity metric drops below 0.6

This is independent from Stage 2 (device-level physics). Don't conflate them.

## Future: Stage 2 — Device-Level Physics

- Pre-train on `jungtaekkim/datasets-nanophotonic-structures`
- Add FDTD simulation (MEEP or Lumerical API)
- Train device-level surrogates per component type
- Plug into circuit GNN as differentiable component models
- WebSocket for streaming generation results

---

## Environment Variables Reference

| Variable | Required | Default | Used By |
|----------|----------|---------|---------|
| `DATABASE_URL` | Yes | — | lib/db |
| `PORT` | Yes | — | api-server, photonics-sim |
| `NODE_ENV` | No | `development` | api-server |
| `LOG_LEVEL` | No | `info` | api-server |
| `ALLOWED_ORIGINS` | No | `http://localhost:5173` | api-server (CORS) |
| `ML_MODEL_PATH` | No | — | api-server (ONNX model) |
| `ML_MODEL_VERSION` | No | `v1` | api-server |
| `ML_SIDECAR_URL` | No | `http://localhost:8000` | api-server (generation proxy) |
