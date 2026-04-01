# ML Photonics Surrogate & Generative Engine — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an ML system that instantly predicts photonic circuit performance (GNN surrogate) and generates novel circuit topologies from user specs (cVAE), integrated into the existing Photonics-Equilibrium app.

**Architecture:** GNN forward surrogate for real-time prediction via WebSocket + conditional VAE for inverse design. Training data generated synthetically from the corrected physics engine. ONNX Runtime for Node.js inference. Python/PyTorch for offline training.

**Tech Stack:** PyTorch + PyTorch Geometric (training), ONNX Runtime Node.js (inference), ws (WebSocket), Vitest (testing), Zustand (frontend state), React + ReactFlow (UI)

---

## Phase 1: Fix the Physics Engine (Oracle)

The engine must be correct before generating training data.

### Task 1: Add Vitest to the API Server

**Files:**
- Modify: `artifacts/api-server/package.json`
- Create: `artifacts/api-server/vitest.config.ts`
- Create: `artifacts/api-server/src/lib/__tests__/photonicsEngine.test.ts`

**Step 1: Install vitest**

Run: `cd /Users/amalniazi/Downloads/Photonics-Equilibrium && pnpm add -D vitest --filter api-server`

**Step 2: Create vitest config**

```typescript
// artifacts/api-server/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});
```

**Step 3: Add test script to package.json**

Add to `artifacts/api-server/package.json` scripts:
```json
"test": "vitest run",
"test:watch": "vitest"
```

**Step 4: Write skeleton test file**

```typescript
// artifacts/api-server/src/lib/__tests__/photonicsEngine.test.ts
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

**Step 5: Run test to verify setup works**

Run: `cd /Users/amalniazi/Downloads/Photonics-Equilibrium/artifacts/api-server && pnpm test`
Expected: 1 test passes

**Step 6: Commit**

```bash
git add artifacts/api-server/vitest.config.ts artifacts/api-server/src/lib/__tests__/ artifacts/api-server/package.json
git commit -m "feat: add vitest to api-server with skeleton engine test"
```

---

### Task 2: Fix Coherence Length Formula (Critical Bug C4)

**Files:**
- Modify: `artifacts/api-server/src/lib/photonicsEngine.ts:102-107`
- Modify: `artifacts/api-server/src/lib/photonicsEngine.ts:367`
- Create: tests in `artifacts/api-server/src/lib/__tests__/photonicsEngine.test.ts`

**Step 1: Write failing test for coherence length**

```typescript
// Add to photonicsEngine.test.ts
describe('coherence length calculation', () => {
  it('computes correct coherence length for a laser source', () => {
    // For a laser at 1550nm with 0.1 GHz bandwidth:
    // L_c = c / delta_nu = 3e8 / (0.1e9) = 3.0 meters = 3000 mm
    const layout: CircuitLayout = {
      components: [
        {
          id: 'laser1',
          type: 'laser_source',
          label: 'Laser',
          x: 0, y: 0,
          params: { wavelength: 1550, power: 0, bandwidth: 0.1 },
        },
        {
          id: 'det1',
          type: 'photodetector',
          label: 'Detector',
          x: 200, y: 0,
          params: { responsivity: 0.8 },
        },
      ],
      connections: [
        { id: 'c1', fromComponentId: 'laser1', fromPort: 'out', toComponentId: 'det1', toPort: 'in' },
      ],
    };
    const result = runPhotonicsSimulation(layout, 1550);
    // coherenceLength should be ~3000 mm (3 meters)
    expect(result.coherenceLength).toBeCloseTo(3000, 0);
  });

  it('computes correct coherence length for wider bandwidth', () => {
    // 10 GHz bandwidth: L_c = 3e8 / 10e9 = 0.03 m = 30 mm
    const layout: CircuitLayout = {
      components: [
        {
          id: 'laser1',
          type: 'laser_source',
          label: 'Laser',
          x: 0, y: 0,
          params: { wavelength: 1550, power: 0, bandwidth: 10 },
        },
      ],
      connections: [],
    };
    const result = runPhotonicsSimulation(layout, 1550);
    expect(result.coherenceLength).toBeCloseTo(30, 0);
  });
});
```

**Step 2: Run test — verify it fails**

Run: `cd /Users/amalniazi/Downloads/Photonics-Equilibrium/artifacts/api-server && pnpm test`
Expected: FAIL — coherence length values are wildly wrong

**Step 3: Fix the `computeCoherenceLength` function**

Replace lines 102-107 in `artifacts/api-server/src/lib/photonicsEngine.ts`:

```typescript
function computeCoherenceLength(wavelength_nm: number, bandwidth_GHz: number): number {
  if (bandwidth_GHz <= 0) return 1e6; // effectively infinite for zero bandwidth
  const c = 3e8; // speed of light m/s
  const delta_nu = bandwidth_GHz * 1e9; // convert GHz to Hz
  const coherenceLength_m = c / delta_nu;
  return coherenceLength_m * 1e3; // convert meters to millimeters
}
```

**Step 4: Fix the inline calculation at line 367**

Replace the inline coherence length calculation:

```typescript
const laserBandwidth = lasers[0]?.params?.bandwidth ?? 0.1;
const coherenceLength = computeCoherenceLength(dominantWavelength, laserBandwidth);
```

**Step 5: Run tests — verify they pass**

Run: `pnpm test`
Expected: All tests pass

**Step 6: Commit**

```bash
git add artifacts/api-server/src/lib/photonicsEngine.ts artifacts/api-server/src/lib/__tests__/photonicsEngine.test.ts
git commit -m "fix: correct coherence length formula (L_c = c / delta_nu)"
```

---

### Task 3: Implement Topological Sort and Graph Power Propagation (Critical Bug I4)

**Files:**
- Modify: `artifacts/api-server/src/lib/photonicsEngine.ts`
- Modify: `artifacts/api-server/src/lib/__tests__/photonicsEngine.test.ts`

**Step 1: Write failing test for power propagation**

```typescript
describe('power propagation through circuit graph', () => {
  it('propagates laser power through a waveguide to a detector', () => {
    const layout: CircuitLayout = {
      components: [
        {
          id: 'laser1', type: 'laser_source', label: 'Laser',
          x: 0, y: 0,
          params: { wavelength: 1550, power: 10, bandwidth: 0.1 },
        },
        {
          id: 'wg1', type: 'waveguide', label: 'Waveguide',
          x: 100, y: 0,
          params: { alpha: 2.0, length: 10000, neff: 2.4 }, // 2 dB/cm * 1 cm = 2 dB loss
        },
        {
          id: 'det1', type: 'photodetector', label: 'Detector',
          x: 200, y: 0,
          params: { responsivity: 0.8 },
        },
      ],
      connections: [
        { id: 'c1', fromComponentId: 'laser1', fromPort: 'out', toComponentId: 'wg1', toPort: 'in' },
        { id: 'c2', fromComponentId: 'wg1', fromPort: 'out', toComponentId: 'det1', toPort: 'in' },
      ],
    };
    const result = runPhotonicsSimulation(layout, 1550);

    // Laser outputs 10 dBm
    const laserResult = result.componentResults.find(r => r.componentId === 'laser1')!;
    expect(laserResult.outputPower).toBe(10);

    // Waveguide receives 10 dBm, loses 2 dB → outputs 8 dBm
    const wgResult = result.componentResults.find(r => r.componentId === 'wg1')!;
    expect(wgResult.inputPower).toBeCloseTo(10, 1);
    expect(wgResult.outputPower).toBeCloseTo(8, 1);

    // Detector receives 8 dBm
    const detResult = result.componentResults.find(r => r.componentId === 'det1')!;
    expect(detResult.inputPower).toBeCloseTo(8, 1);
  });

  it('propagates through a beam splitter correctly', () => {
    const layout: CircuitLayout = {
      components: [
        {
          id: 'laser1', type: 'laser_source', label: 'Laser',
          x: 0, y: 0,
          params: { wavelength: 1550, power: 10, bandwidth: 0.1 },
        },
        {
          id: 'bs1', type: 'beam_splitter', label: '50/50 Splitter',
          x: 100, y: 0,
          params: { splitRatio: 0.5, loss: 0.3 },
        },
        {
          id: 'det1', type: 'photodetector', label: 'Detector',
          x: 200, y: 0,
          params: { responsivity: 0.8 },
        },
      ],
      connections: [
        { id: 'c1', fromComponentId: 'laser1', fromPort: 'out', toComponentId: 'bs1', toPort: 'in' },
        { id: 'c2', fromComponentId: 'bs1', fromPort: 'out', toComponentId: 'det1', toPort: 'in' },
      ],
    };
    const result = runPhotonicsSimulation(layout, 1550);

    // Beam splitter receives 10 dBm, loses 0.3 dB → 9.7 dBm
    const bsResult = result.componentResults.find(r => r.componentId === 'bs1')!;
    expect(bsResult.inputPower).toBeCloseTo(10, 1);
    expect(bsResult.outputPower).toBeCloseTo(9.7, 1);
  });
});
```

**Step 2: Run test — verify it fails**

Run: `pnpm test`
Expected: FAIL — waveguide inputPower is 0, not 10

**Step 3: Implement topological sort and propagation**

Add a topological sort function and rewrite the simulation loop in `photonicsEngine.ts`. Before the `for (const comp of components)` loop (line 172), add:

```typescript
// Build adjacency for topological sort
function topologicalSort(components: CircuitComponent[], connections: Connection[]): CircuitComponent[] {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  components.forEach(c => {
    inDegree.set(c.id, 0);
    adjacency.set(c.id, []);
  });

  connections.forEach(conn => {
    adjacency.get(conn.fromComponentId)?.push(conn.toComponentId);
    inDegree.set(conn.toComponentId, (inDegree.get(conn.toComponentId) ?? 0) + 1);
  });

  const queue: string[] = [];
  inDegree.forEach((deg, id) => { if (deg === 0) queue.push(id); });

  const sorted: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    sorted.push(id);
    for (const next of adjacency.get(id) ?? []) {
      const newDeg = (inDegree.get(next) ?? 1) - 1;
      inDegree.set(next, newDeg);
      if (newDeg === 0) queue.push(next);
    }
  }

  // Add any remaining components (disconnected / cycles)
  components.forEach(c => { if (!sorted.includes(c.id)) sorted.push(c.id); });

  return sorted.map(id => componentMap.get(id)!).filter(Boolean);
}

// Track output power per component for propagation
const outputPowerMap = new Map<string, number>();

// Build reverse lookup: toComponentId → fromComponentId[]
const incomingMap = new Map<string, string[]>();
connections.forEach(conn => {
  if (!incomingMap.has(conn.toComponentId)) incomingMap.set(conn.toComponentId, []);
  incomingMap.get(conn.toComponentId)!.push(conn.fromComponentId);
});

const sortedComponents = topologicalSort(components, connections);
```

Then change the simulation loop to iterate `sortedComponents` instead of `components`, and compute `inputPower` from incoming connections:

```typescript
for (const comp of sortedComponents) {
    // ... existing per-component code, but replace the fixed inputPower = 0 with:

    // Compute input power from upstream components
    const incomingIds = incomingMap.get(comp.id) ?? [];
    if (comp.type !== 'laser_source' && incomingIds.length > 0) {
      // Sum power from all incoming connections (in watts, then convert back)
      let totalIncomingWatts = 0;
      for (const srcId of incomingIds) {
        const srcPower = outputPowerMap.get(srcId) ?? -100;
        totalIncomingWatts += dBmToWatts(srcPower);
      }
      inputPower = totalIncomingWatts > 0 ? wattsToDBm(totalIncomingWatts) : -100;
    }

    // Then compute outputPower = inputPower - loss (or + gain for amplifiers)
```

And after computing `outputPower` for each component, store it:

```typescript
    outputPowerMap.set(comp.id, outputPower);
```

**Step 4: Run tests — verify they pass**

Run: `pnpm test`
Expected: All tests pass

**Step 5: Commit**

```bash
git add artifacts/api-server/src/lib/photonicsEngine.ts artifacts/api-server/src/lib/__tests__/photonicsEngine.test.ts
git commit -m "feat: implement topological sort and graph power propagation"
```

---

### Task 4: Add dBm/Watts Conversion Tests and Edge Case Hardening

**Files:**
- Modify: `artifacts/api-server/src/lib/__tests__/photonicsEngine.test.ts`

**Step 1: Write tests for conversion functions and edge cases**

```typescript
describe('dBm/Watts conversions', () => {
  it('converts 0 dBm to 1 mW', () => {
    // We need to export these or test indirectly
    // Test via laser: 0 dBm laser → system should show 0 dBm input
    const layout: CircuitLayout = {
      components: [
        { id: 'l1', type: 'laser_source', label: 'L', x: 0, y: 0, params: { power: 0, wavelength: 1550, bandwidth: 0.1 } },
      ],
      connections: [],
    };
    const result = runPhotonicsSimulation(layout, 1550);
    expect(result.totalInputPower).toBeCloseTo(0, 1);
  });
});

describe('edge cases', () => {
  it('handles amplifier gain correctly in propagation', () => {
    const layout: CircuitLayout = {
      components: [
        { id: 'l1', type: 'laser_source', label: 'Laser', x: 0, y: 0, params: { power: 0, wavelength: 1550, bandwidth: 0.1 } },
        { id: 'a1', type: 'optical_amplifier', label: 'Amp', x: 100, y: 0, params: { gain: 10, loss: 1 } },
        { id: 'd1', type: 'photodetector', label: 'Det', x: 200, y: 0, params: { responsivity: 0.8 } },
      ],
      connections: [
        { id: 'c1', fromComponentId: 'l1', fromPort: 'out', toComponentId: 'a1', toPort: 'in' },
        { id: 'c2', fromComponentId: 'a1', fromPort: 'out', toComponentId: 'd1', toPort: 'in' },
      ],
    };
    const result = runPhotonicsSimulation(layout, 1550);
    const ampResult = result.componentResults.find(r => r.componentId === 'a1')!;
    // Amp receives 0 dBm, gain 10 dB - 1 dB loss = 9 dBm
    expect(ampResult.inputPower).toBeCloseTo(0, 1);
    expect(ampResult.outputPower).toBeCloseTo(9, 1);
  });

  it('handles disconnected components gracefully', () => {
    const layout: CircuitLayout = {
      components: [
        { id: 'l1', type: 'laser_source', label: 'Laser', x: 0, y: 0, params: { power: 10, wavelength: 1550, bandwidth: 0.1 } },
        { id: 'wg1', type: 'waveguide', label: 'Floating WG', x: 100, y: 100, params: { alpha: 2, length: 1000 } },
      ],
      connections: [],
    };
    const result = runPhotonicsSimulation(layout, 1550);
    expect(result.issues.some(i => i.code === 'UNCONNECTED_COMPONENT')).toBe(true);
    // Floating waveguide should have -100 dBm input (no signal)
    const wgResult = result.componentResults.find(r => r.componentId === 'wg1')!;
    expect(wgResult.inputPower).toBeLessThan(-50);
  });
});
```

**Step 2: Run tests**

Run: `pnpm test`
Expected: All pass

**Step 3: Commit**

```bash
git add artifacts/api-server/src/lib/__tests__/photonicsEngine.test.ts
git commit -m "test: add conversion and edge case tests for physics engine"
```

---

## Phase 2: Shared ML Types Library

### Task 5: Create `lib/ml-models` Package

**Files:**
- Create: `lib/ml-models/package.json`
- Create: `lib/ml-models/tsconfig.json`
- Create: `lib/ml-models/src/index.ts`
- Create: `lib/ml-models/src/types.ts`
- Create: `lib/ml-models/src/graphEncoder.ts`
- Create: `lib/ml-models/src/graphDecoder.ts`

**Step 1: Create package.json**

```json
{
  "name": "@workspace/ml-models",
  "version": "0.0.1",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "catalog:"
  },
  "devDependencies": {
    "@types/node": "catalog:",
    "typescript": "~5.9.2"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"]
}
```

**Step 3: Create types.ts with training data schema**

```typescript
// lib/ml-models/src/types.ts
import { z } from "zod/v4";

export const ComponentTypeEnum = z.enum([
  "laser_source", "waveguide", "beam_splitter", "coupler", "modulator",
  "photodetector", "optical_amplifier", "phase_shifter", "filter",
  "isolator", "circulator", "mzi", "ring_resonator", "grating_coupler", "mirror",
]);
export type ComponentType = z.infer<typeof ComponentTypeEnum>;

// 15 component types → one-hot vector
export const COMPONENT_TYPES = ComponentTypeEnum.options;
export const NUM_COMPONENT_TYPES = COMPONENT_TYPES.length;

// Standardized parameter keys in fixed order for the model
export const PARAM_KEYS = [
  "wavelength", "power", "loss", "splitRatio", "couplingCoeff",
  "length", "neff", "alpha", "gain", "responsivity",
  "phaseShift", "bandwidth", "extinctionRatio", "reflectivity",
] as const;
export const NUM_PARAMS = PARAM_KEYS.length;

// Total node feature size: one-hot type (15) + params (14) = 29
export const NODE_FEATURE_DIM = NUM_COMPONENT_TYPES + NUM_PARAMS;

export interface GraphNode {
  id: string;
  type: ComponentType;
  params: Record<string, number>;
}

export interface GraphEdge {
  source: string;
  target: string;
  sourcePort: string;
  targetPort: string;
}

export interface GraphInput {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface PerNodePrediction {
  id: string;
  outputPower_dBm: number;
  snr_dB: number;
  phase_rad: number;
  status: "ok" | "warning" | "error";
}

export interface GlobalPrediction {
  equilibriumScore: number;
  totalSystemLoss_dB: number;
  coherenceLength_mm: number;
  converged: boolean;
}

export interface PredictionOutput {
  perNode: PerNodePrediction[];
  global: GlobalPrediction;
}

export interface TrainingExample {
  graph: GraphInput;
  results: {
    perNode: PerNodePrediction[];
    global: GlobalPrediction & {
      issues: Array<{ severity: string; message: string }>;
    };
  };
  meta: {
    topology: string;
    componentCount: number;
    generatedAt: string;
  };
}

// Inverse design request
export interface GenerateRequest {
  targetWavelength: number;
  targetPower: number;
  targetSNR: number;
  maxComponents: number;
  numCandidates: number;
  topologyHint?: string;
}

export interface GenerateCandidate {
  circuit: GraphInput;
  predictedScore: number;
  confidence: number;
}

export interface GenerateResponse {
  candidates: GenerateCandidate[];
}
```

**Step 4: Create graphEncoder.ts**

```typescript
// lib/ml-models/src/graphEncoder.ts
import { COMPONENT_TYPES, PARAM_KEYS, type GraphInput, type GraphNode } from "./types.js";

/**
 * Encode a graph node into a fixed-size feature vector.
 * Format: [one_hot_type (15)] + [normalized_params (14)] = 29 floats
 */
export function encodeNodeFeatures(node: GraphNode): number[] {
  // One-hot encode component type
  const typeOneHot = COMPONENT_TYPES.map(t => t === node.type ? 1.0 : 0.0);

  // Normalize parameters to [0, 1] range using known physical bounds
  const paramBounds: Record<string, [number, number]> = {
    wavelength: [400, 2000],     // nm
    power: [-30, 30],            // dBm
    loss: [0, 30],               // dB
    splitRatio: [0, 1],          // ratio
    couplingCoeff: [0, 1],       // ratio
    length: [0, 100000],         // um
    neff: [1.0, 4.0],           // effective index
    alpha: [0, 20],              // dB/cm
    gain: [0, 40],               // dB
    responsivity: [0, 2],        // A/W
    phaseShift: [0, 6.284],      // radians (2*PI)
    bandwidth: [0, 1000],        // GHz
    extinctionRatio: [0, 40],    // dB
    reflectivity: [0, 1],        // ratio
  };

  const params = PARAM_KEYS.map(key => {
    const val = node.params[key] ?? 0;
    const [min, max] = paramBounds[key] ?? [0, 1];
    return max > min ? (val - min) / (max - min) : 0;
  });

  return [...typeOneHot, ...params];
}

/**
 * Encode a full circuit graph into tensor-ready format.
 * Returns: { nodeFeatures: number[][], edgeIndex: number[][] (2 x E), nodeIds: string[] }
 */
export function encodeGraph(graph: GraphInput): {
  nodeFeatures: number[][];
  edgeIndex: [number[], number[]];
  nodeIds: string[];
} {
  const nodeIds = graph.nodes.map(n => n.id);
  const idToIdx = new Map(nodeIds.map((id, i) => [id, i]));

  const nodeFeatures = graph.nodes.map(n => encodeNodeFeatures(n));

  const srcIndices: number[] = [];
  const tgtIndices: number[] = [];
  for (const edge of graph.edges) {
    const srcIdx = idToIdx.get(edge.source);
    const tgtIdx = idToIdx.get(edge.target);
    if (srcIdx !== undefined && tgtIdx !== undefined) {
      srcIndices.push(srcIdx);
      tgtIndices.push(tgtIdx);
    }
  }

  return {
    nodeFeatures,
    edgeIndex: [srcIndices, tgtIndices],
    nodeIds,
  };
}
```

**Step 5: Create graphDecoder.ts**

```typescript
// lib/ml-models/src/graphDecoder.ts
import { COMPONENT_TYPES, PARAM_KEYS, type GraphInput, type GraphNode, type GraphEdge } from "./types.js";

/**
 * Decode a node feature vector back into a GraphNode.
 */
export function decodeNodeFeatures(features: number[], id: string): GraphNode {
  // Extract component type from one-hot (first 15 values)
  const typeScores = features.slice(0, COMPONENT_TYPES.length);
  const typeIdx = typeScores.indexOf(Math.max(...typeScores));
  const type = COMPONENT_TYPES[typeIdx] ?? "waveguide";

  // Denormalize parameters
  const paramBounds: Record<string, [number, number]> = {
    wavelength: [400, 2000],
    power: [-30, 30],
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

  const params: Record<string, number> = {};
  PARAM_KEYS.forEach((key, i) => {
    const normalized = features[COMPONENT_TYPES.length + i] ?? 0;
    const [min, max] = paramBounds[key] ?? [0, 1];
    params[key] = normalized * (max - min) + min;
  });

  return { id, type, params };
}

/**
 * Convert a generated graph (from cVAE) into ReactFlow-compatible format.
 */
export function graphToReactFlowFormat(graph: GraphInput): {
  nodes: Array<{ id: string; type: string; position: { x: number; y: number }; data: any }>;
  edges: Array<{ id: string; source: string; target: string; animated: boolean }>;
} {
  const nodes = graph.nodes.map((n, i) => ({
    id: n.id,
    type: "photonNode",
    position: { x: i * 200, y: Math.sin(i) * 100 + 200 },
    data: { label: `${n.type}_${i}`, type: n.type, params: n.params },
  }));

  const edges = graph.edges.map((e, i) => ({
    id: `e-${e.source}-${e.target}`,
    source: e.source,
    target: e.target,
    animated: true,
  }));

  return { nodes, edges };
}
```

**Step 6: Create index.ts**

```typescript
// lib/ml-models/src/index.ts
export * from "./types.js";
export * from "./graphEncoder.js";
export * from "./graphDecoder.js";
```

**Step 7: Install dependencies and verify types**

Run: `cd /Users/amalniazi/Downloads/Photonics-Equilibrium && pnpm install && cd lib/ml-models && pnpm typecheck`
Expected: No type errors

**Step 8: Commit**

```bash
git add lib/ml-models/
git commit -m "feat: add @workspace/ml-models shared types and graph encoder/decoder"
```

---

## Phase 3: Training Pipeline (Python)

### Task 6: Set Up Python Training Pipeline Scaffolding

**Files:**
- Create: `artifacts/training-pipeline/pyproject.toml`
- Create: `artifacts/training-pipeline/src/data_factory/__init__.py`
- Create: `artifacts/training-pipeline/src/data_factory/circuit_generator.py`
- Create: `artifacts/training-pipeline/src/data_factory/topology_templates.py`
- Create: `artifacts/training-pipeline/src/models/__init__.py`
- Create: `artifacts/training-pipeline/src/models/forward_gnn.py`
- Create: `artifacts/training-pipeline/src/training/__init__.py`
- Create: `artifacts/training-pipeline/src/training/train_surrogate.py`
- Create: `artifacts/training-pipeline/src/training/export_onnx.py`
- Create: `artifacts/training-pipeline/src/evaluation/__init__.py`
- Create: `artifacts/training-pipeline/src/evaluation/metrics.py`

**Step 1: Create pyproject.toml**

```toml
[project]
name = "photonics-ml-training"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
  "torch>=2.4",
  "torch-geometric>=2.6",
  "numpy>=1.26",
  "pandas>=2.2",
  "pyarrow>=17.0",
  "scikit-learn>=1.5",
  "onnx>=1.16",
  "onnxruntime>=1.19",
  "tqdm>=4.66",
  "matplotlib>=3.9",
]

[project.optional-dependencies]
dev = ["pytest>=8.0", "ruff>=0.6"]

[tool.ruff]
line-length = 100
```

**Step 2: Create topology templates**

```python
# artifacts/training-pipeline/src/data_factory/topology_templates.py
"""Predefined circuit topology templates for synthetic data generation."""
import random
from typing import TypedDict

class Component(TypedDict):
    id: str
    type: str
    params: dict

class Connection(TypedDict):
    id: str
    fromComponentId: str
    fromPort: str
    toComponentId: str
    toPort: str

class CircuitTemplate(TypedDict):
    components: list[Component]
    connections: list[Connection]
    topology: str


COMPONENT_PARAM_RANGES = {
    "laser_source": {"wavelength": (850, 1650), "power": (-10, 20), "bandwidth": (0.01, 100)},
    "waveguide": {"alpha": (0.1, 10), "length": (100, 50000), "neff": (1.5, 3.5)},
    "beam_splitter": {"splitRatio": (0.1, 0.9), "loss": (0.1, 1.0)},
    "coupler": {"couplingCoeff": (0.05, 0.95), "loss": (0.1, 1.5)},
    "modulator": {"extinctionRatio": (5, 40), "loss": (1, 10)},
    "photodetector": {"responsivity": (0.3, 1.2)},
    "optical_amplifier": {"gain": (5, 30), "loss": (0.5, 3)},
    "phase_shifter": {"phaseShift": (0, 6.284), "loss": (0.1, 1.5)},
    "filter": {"bandwidth": (10, 500), "loss": (0.5, 3)},
    "isolator": {"loss": (0.3, 1.5)},
    "circulator": {"loss": (0.5, 2)},
    "mzi": {"phaseShift": (0, 6.284), "loss": (1, 5)},
    "ring_resonator": {"couplingCoeff": (0.01, 0.5), "loss": (1, 8)},
    "grating_coupler": {"loss": (1, 8)},
    "mirror": {"reflectivity": (0.5, 0.999)},
}

PASSIVE_TYPES = ["waveguide", "beam_splitter", "coupler", "filter", "isolator", "mzi", "ring_resonator", "grating_coupler"]
ACTIVE_TYPES = ["modulator", "optical_amplifier", "phase_shifter"]


def _rand_params(comp_type: str, wavelength: float) -> dict:
    """Generate random parameters for a component type."""
    ranges = COMPONENT_PARAM_RANGES.get(comp_type, {})
    params = {}
    for key, (lo, hi) in ranges.items():
        params[key] = random.uniform(lo, hi)
    params["wavelength"] = wavelength + random.gauss(0, 2)  # slight jitter
    return params


def linear_chain(n_middle: int = 3) -> CircuitTemplate:
    """Laser → [n_middle passive/active components] → Detector"""
    wl = random.uniform(850, 1650)
    comps: list[Component] = []
    conns: list[Connection] = []

    comps.append({"id": "c0", "type": "laser_source", "params": _rand_params("laser_source", wl)})

    for i in range(n_middle):
        ctype = random.choice(PASSIVE_TYPES + ACTIVE_TYPES)
        comps.append({"id": f"c{i+1}", "type": ctype, "params": _rand_params(ctype, wl)})
        conns.append({
            "id": f"e{i}", "fromComponentId": f"c{i}", "fromPort": "out",
            "toComponentId": f"c{i+1}", "toPort": "in",
        })

    det_id = f"c{n_middle+1}"
    comps.append({"id": det_id, "type": "photodetector", "params": _rand_params("photodetector", wl)})
    conns.append({
        "id": f"e{n_middle}", "fromComponentId": f"c{n_middle}", "fromPort": "out",
        "toComponentId": det_id, "toPort": "in",
    })

    return {"components": comps, "connections": conns, "topology": "linear_chain"}


def mzi_interferometer() -> CircuitTemplate:
    """Laser → Splitter → [arm1, arm2] → Combiner → Detector"""
    wl = random.uniform(1300, 1600)
    comps: list[Component] = [
        {"id": "laser", "type": "laser_source", "params": _rand_params("laser_source", wl)},
        {"id": "split", "type": "beam_splitter", "params": _rand_params("beam_splitter", wl)},
        {"id": "arm1", "type": "phase_shifter", "params": _rand_params("phase_shifter", wl)},
        {"id": "arm2", "type": "waveguide", "params": _rand_params("waveguide", wl)},
        {"id": "combine", "type": "coupler", "params": _rand_params("coupler", wl)},
        {"id": "det", "type": "photodetector", "params": _rand_params("photodetector", wl)},
    ]
    conns: list[Connection] = [
        {"id": "e0", "fromComponentId": "laser", "fromPort": "out", "toComponentId": "split", "toPort": "in"},
        {"id": "e1", "fromComponentId": "split", "fromPort": "out1", "toComponentId": "arm1", "toPort": "in"},
        {"id": "e2", "fromComponentId": "split", "fromPort": "out2", "toComponentId": "arm2", "toPort": "in"},
        {"id": "e3", "fromComponentId": "arm1", "fromPort": "out", "toComponentId": "combine", "toPort": "in1"},
        {"id": "e4", "fromComponentId": "arm2", "fromPort": "out", "toComponentId": "combine", "toPort": "in2"},
        {"id": "e5", "fromComponentId": "combine", "fromPort": "out", "toComponentId": "det", "toPort": "in"},
    ]
    return {"components": comps, "connections": conns, "topology": "mzi"}


def ring_filter() -> CircuitTemplate:
    """Laser → Waveguide → Ring Resonator → Detector"""
    wl = random.uniform(1500, 1600)
    comps: list[Component] = [
        {"id": "laser", "type": "laser_source", "params": _rand_params("laser_source", wl)},
        {"id": "wg_in", "type": "waveguide", "params": _rand_params("waveguide", wl)},
        {"id": "ring", "type": "ring_resonator", "params": _rand_params("ring_resonator", wl)},
        {"id": "wg_out", "type": "waveguide", "params": _rand_params("waveguide", wl)},
        {"id": "det", "type": "photodetector", "params": _rand_params("photodetector", wl)},
    ]
    conns: list[Connection] = [
        {"id": "e0", "fromComponentId": "laser", "fromPort": "out", "toComponentId": "wg_in", "toPort": "in"},
        {"id": "e1", "fromComponentId": "wg_in", "fromPort": "out", "toComponentId": "ring", "toPort": "in"},
        {"id": "e2", "fromComponentId": "ring", "fromPort": "out", "toComponentId": "wg_out", "toPort": "in"},
        {"id": "e3", "fromComponentId": "wg_out", "fromPort": "out", "toComponentId": "det", "toPort": "in"},
    ]
    return {"components": comps, "connections": conns, "topology": "ring_filter"}


TEMPLATES = {
    "linear_chain": linear_chain,
    "mzi": mzi_interferometer,
    "ring_filter": ring_filter,
}


def generate_random_circuit() -> CircuitTemplate:
    """Generate a random circuit from a random template."""
    template_name = random.choice(list(TEMPLATES.keys()))
    template_fn = TEMPLATES[template_name]
    if template_name == "linear_chain":
        return template_fn(n_middle=random.randint(1, 8))
    return template_fn()
```

**Step 3: Create circuit generator (calls physics engine via HTTP)**

```python
# artifacts/training-pipeline/src/data_factory/circuit_generator.py
"""Generate synthetic training data by creating circuits and simulating them."""
import json
import random
import requests
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from .topology_templates import generate_random_circuit, TEMPLATES


def simulate_circuit(api_url: str, circuit: dict, target_wavelength: float) -> Optional[dict]:
    """Create a build, run simulation, and return the training example."""
    try:
        # Create build
        build_resp = requests.post(f"{api_url}/api/builds", json={
            "name": f"synthetic_{datetime.now().isoformat()}",
            "layout": {"components": circuit["components"], "connections": circuit["connections"]},
            "targetWavelength": target_wavelength,
        })
        build_resp.raise_for_status()
        build = build_resp.json()

        # Run simulation
        sim_resp = requests.post(f"{api_url}/api/builds/{build['id']}/simulate")
        sim_resp.raise_for_status()
        sim = sim_resp.json()

        # Clean up - delete the build
        requests.delete(f"{api_url}/api/builds/{build['id']}")

        return {
            "graph": {
                "nodes": [{"id": c["id"], "type": c["type"], "params": c["params"]} for c in circuit["components"]],
                "edges": [{"source": c["fromComponentId"], "target": c["toComponentId"],
                           "sourcePort": c["fromPort"], "targetPort": c["toPort"]} for c in circuit["connections"]],
            },
            "results": {
                "perNode": [
                    {"id": cr["componentId"], "outputPower_dBm": cr["outputPower"],
                     "snr_dB": sim.get("snr", 0), "phase_rad": cr["phase"],
                     "status": cr["status"]}
                    for cr in sim["componentResults"]
                ],
                "global": {
                    "equilibriumScore": sim["equilibriumScore"],
                    "totalSystemLoss_dB": sim["systemLoss"],
                    "coherenceLength_mm": sim["coherenceLength"],
                    "converged": sim["converged"],
                    "issues": [{"severity": i["severity"], "message": i["message"]} for i in sim.get("issues", [])],
                },
            },
            "meta": {
                "topology": circuit["topology"],
                "componentCount": len(circuit["components"]),
                "generatedAt": datetime.now(timezone.utc).isoformat(),
            },
        }
    except Exception as e:
        print(f"Failed to simulate circuit: {e}")
        return None


def generate_dataset(
    api_url: str,
    num_examples: int = 1000,
    output_path: str = "data/training_data.jsonl",
    seed: int = 42,
):
    """Generate a dataset of training examples."""
    random.seed(seed)
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    count = 0
    with open(output_path, "w") as f:
        for i in range(num_examples):
            circuit = generate_random_circuit()
            wl = circuit["components"][0]["params"].get("wavelength", 1550)
            example = simulate_circuit(api_url, circuit, wl)
            if example:
                f.write(json.dumps(example) + "\n")
                count += 1
            if (i + 1) % 100 == 0:
                print(f"Generated {count}/{i+1} examples...")

    print(f"Dataset complete: {count} examples saved to {output_path}")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-url", default="http://localhost:3000")
    parser.add_argument("--num-examples", type=int, default=1000)
    parser.add_argument("--output", default="data/training_data.jsonl")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    generate_dataset(args.api_url, args.num_examples, args.output, args.seed)
```

**Step 4: Create the GNN model**

```python
# artifacts/training-pipeline/src/models/forward_gnn.py
"""MPNN-based forward surrogate for photonic circuit prediction."""
import torch
import torch.nn as nn
from torch_geometric.nn import MessagePassing, global_mean_pool
from torch_geometric.data import Data, Batch


NODE_FEATURE_DIM = 29  # 15 (type one-hot) + 14 (params)
HIDDEN_DIM = 128
NUM_LAYERS = 6
NUM_NODE_OUTPUTS = 4   # power, snr, phase, status_logit
NUM_GLOBAL_OUTPUTS = 4  # eq_score, system_loss, coherence_length, converged_logit


class PhotonMPNNLayer(MessagePassing):
    """Single message passing layer with GRU aggregation."""

    def __init__(self, hidden_dim: int):
        super().__init__(aggr="add")
        self.message_mlp = nn.Sequential(
            nn.Linear(hidden_dim * 2, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, hidden_dim),
        )
        self.gru = nn.GRUCell(hidden_dim, hidden_dim)

    def forward(self, x: torch.Tensor, edge_index: torch.Tensor) -> torch.Tensor:
        out = self.propagate(edge_index, x=x)
        return self.gru(out, x)

    def message(self, x_i: torch.Tensor, x_j: torch.Tensor) -> torch.Tensor:
        return self.message_mlp(torch.cat([x_i, x_j], dim=-1))


class PhotonicSurrogateGNN(nn.Module):
    """Full forward surrogate model."""

    def __init__(
        self,
        input_dim: int = NODE_FEATURE_DIM,
        hidden_dim: int = HIDDEN_DIM,
        num_layers: int = NUM_LAYERS,
        dropout: float = 0.1,
    ):
        super().__init__()
        self.node_encoder = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, hidden_dim),
        )

        self.layers = nn.ModuleList([
            PhotonMPNNLayer(hidden_dim) for _ in range(num_layers)
        ])
        self.dropout = nn.Dropout(dropout)

        # Per-node prediction head
        self.node_head = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.ReLU(),
            nn.Linear(hidden_dim // 2, NUM_NODE_OUTPUTS),
        )

        # Global prediction head
        self.global_head = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.ReLU(),
            nn.Linear(hidden_dim // 2, NUM_GLOBAL_OUTPUTS),
        )

    def forward(self, data: Data) -> tuple[torch.Tensor, torch.Tensor]:
        x = self.node_encoder(data.x)

        for layer in self.layers:
            x = layer(x, data.edge_index)
            x = self.dropout(x)

        # Per-node predictions
        node_out = self.node_head(x)

        # Global predictions via mean pooling
        batch = data.batch if hasattr(data, "batch") else torch.zeros(x.size(0), dtype=torch.long)
        pooled = global_mean_pool(x, batch)
        global_out = self.global_head(pooled)

        return node_out, global_out
```

**Step 5: Create training script skeleton**

```python
# artifacts/training-pipeline/src/training/train_surrogate.py
"""Training loop for the forward surrogate GNN."""
import json
import torch
import torch.nn as nn
from torch.optim import Adam
from torch_geometric.data import Data, DataLoader
from pathlib import Path
from typing import Optional

from ..models.forward_gnn import PhotonicSurrogateGNN, NODE_FEATURE_DIM

# Component type one-hot encoding order
COMPONENT_TYPES = [
    "laser_source", "waveguide", "beam_splitter", "coupler", "modulator",
    "photodetector", "optical_amplifier", "phase_shifter", "filter",
    "isolator", "circulator", "mzi", "ring_resonator", "grating_coupler", "mirror",
]
PARAM_KEYS = [
    "wavelength", "power", "loss", "splitRatio", "couplingCoeff",
    "length", "neff", "alpha", "gain", "responsivity",
    "phaseShift", "bandwidth", "extinctionRatio", "reflectivity",
]
PARAM_BOUNDS = {
    "wavelength": (400, 2000), "power": (-30, 30), "loss": (0, 30),
    "splitRatio": (0, 1), "couplingCoeff": (0, 1), "length": (0, 100000),
    "neff": (1.0, 4.0), "alpha": (0, 20), "gain": (0, 40),
    "responsivity": (0, 2), "phaseShift": (0, 6.284), "bandwidth": (0, 1000),
    "extinctionRatio": (0, 40), "reflectivity": (0, 1),
}


def encode_node(node: dict) -> list[float]:
    """Encode a node dict into feature vector."""
    type_onehot = [1.0 if t == node["type"] else 0.0 for t in COMPONENT_TYPES]
    params = []
    for key in PARAM_KEYS:
        val = node["params"].get(key, 0)
        lo, hi = PARAM_BOUNDS.get(key, (0, 1))
        params.append((val - lo) / (hi - lo) if hi > lo else 0.0)
    return type_onehot + params


def example_to_pyg(example: dict) -> Optional[Data]:
    """Convert a training example to PyG Data object."""
    nodes = example["graph"]["nodes"]
    edges = example["graph"]["edges"]
    if len(nodes) == 0:
        return None

    id_to_idx = {n["id"]: i for i, n in enumerate(nodes)}
    x = torch.tensor([encode_node(n) for n in nodes], dtype=torch.float)

    src, tgt = [], []
    for e in edges:
        si, ti = id_to_idx.get(e["source"]), id_to_idx.get(e["target"])
        if si is not None and ti is not None:
            src.append(si)
            tgt.append(ti)
    edge_index = torch.tensor([src, tgt], dtype=torch.long) if src else torch.zeros((2, 0), dtype=torch.long)

    # Node-level labels
    per_node = example["results"]["perNode"]
    id_to_result = {r["id"]: r for r in per_node}
    node_labels = []
    for n in nodes:
        r = id_to_result.get(n["id"], {})
        node_labels.append([
            r.get("outputPower_dBm", -100),
            r.get("snr_dB", 0),
            r.get("phase_rad", 0),
            {"ok": 0, "warning": 1, "error": 2}.get(r.get("status", "ok"), 0),
        ])
    y_node = torch.tensor(node_labels, dtype=torch.float)

    # Global labels
    g = example["results"]["global"]
    y_global = torch.tensor([[
        g["equilibriumScore"],
        g["totalSystemLoss_dB"],
        g["coherenceLength_mm"],
        1.0 if g["converged"] else 0.0,
    ]], dtype=torch.float)

    return Data(x=x, edge_index=edge_index, y_node=y_node, y_global=y_global)


def load_dataset(path: str) -> list[Data]:
    """Load JSONL dataset into list of PyG Data objects."""
    dataset = []
    with open(path) as f:
        for line in f:
            example = json.loads(line)
            data = example_to_pyg(example)
            if data is not None:
                dataset.append(data)
    return dataset


def train(
    data_path: str = "data/training_data.jsonl",
    epochs: int = 100,
    lr: float = 1e-3,
    batch_size: int = 32,
    save_path: str = "models/surrogate_v1.pt",
):
    """Train the forward surrogate."""
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Training on {device}")

    dataset = load_dataset(data_path)
    split = int(0.9 * len(dataset))
    train_data, val_data = dataset[:split], dataset[split:]
    print(f"Train: {len(train_data)}, Val: {len(val_data)}")

    train_loader = DataLoader(train_data, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_data, batch_size=batch_size)

    model = PhotonicSurrogateGNN().to(device)
    optimizer = Adam(model.parameters(), lr=lr)

    mse = nn.MSELoss()
    ce = nn.CrossEntropyLoss()

    best_val_loss = float("inf")

    for epoch in range(epochs):
        model.train()
        total_loss = 0
        for batch in train_loader:
            batch = batch.to(device)
            optimizer.zero_grad()

            node_out, global_out = model(batch)

            # Node loss: MSE for power/snr/phase, CE for status
            loss_node_continuous = mse(node_out[:, :3], batch.y_node[:, :3])
            loss_node_status = ce(
                node_out[:, 3:].unsqueeze(1).expand(-1, 3, -1).reshape(-1, 3) if node_out.shape[1] > 3 else node_out[:, 3:4].expand(-1, 3),
                batch.y_node[:, 3].long(),
            ) if node_out.shape[0] > 0 else torch.tensor(0.0)

            # Global loss: MSE for score/loss/coherence, BCE for converged
            loss_global_continuous = mse(global_out[:, :3], batch.y_global[:, :3])
            loss_global_converged = nn.BCEWithLogitsLoss()(global_out[:, 3], batch.y_global[:, 3])

            loss = loss_node_continuous + 0.1 * loss_node_status + loss_global_continuous + loss_global_converged
            loss.backward()
            optimizer.step()
            total_loss += loss.item()

        # Validation
        model.eval()
        val_loss = 0
        with torch.no_grad():
            for batch in val_loader:
                batch = batch.to(device)
                node_out, global_out = model(batch)
                val_loss += mse(node_out[:, :3], batch.y_node[:, :3]).item()
                val_loss += mse(global_out[:, :3], batch.y_global[:, :3]).item()

        avg_train = total_loss / len(train_loader)
        avg_val = val_loss / max(len(val_loader), 1)
        print(f"Epoch {epoch+1}/{epochs} | Train: {avg_train:.4f} | Val: {avg_val:.4f}")

        if avg_val < best_val_loss:
            best_val_loss = avg_val
            Path(save_path).parent.mkdir(parents=True, exist_ok=True)
            torch.save(model.state_dict(), save_path)
            print(f"  Saved best model (val_loss={avg_val:.4f})")

    print(f"Training complete. Best val loss: {best_val_loss:.4f}")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default="data/training_data.jsonl")
    parser.add_argument("--epochs", type=int, default=100)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--save", default="models/surrogate_v1.pt")
    args = parser.parse_args()
    train(args.data, args.epochs, args.lr, args.batch_size, args.save)
```

**Step 6: Create ONNX export script**

```python
# artifacts/training-pipeline/src/training/export_onnx.py
"""Export trained PyTorch model to ONNX format for Node.js inference."""
import torch
from torch_geometric.data import Data
from ..models.forward_gnn import PhotonicSurrogateGNN, NODE_FEATURE_DIM


def export_to_onnx(
    model_path: str = "models/surrogate_v1.pt",
    output_path: str = "models/surrogate_v1.onnx",
    max_nodes: int = 50,
):
    """Export the GNN surrogate to ONNX."""
    model = PhotonicSurrogateGNN()
    model.load_state_dict(torch.load(model_path, map_location="cpu"))
    model.eval()

    # Create dummy input
    dummy_x = torch.randn(max_nodes, NODE_FEATURE_DIM)
    dummy_edge_index = torch.randint(0, max_nodes, (2, max_nodes * 2))
    dummy_batch = torch.zeros(max_nodes, dtype=torch.long)

    # Export — note: PyG custom ops may need torch.jit as fallback
    try:
        torch.onnx.export(
            model,
            (Data(x=dummy_x, edge_index=dummy_edge_index, batch=dummy_batch),),
            output_path,
            input_names=["x", "edge_index", "batch"],
            output_names=["node_predictions", "global_predictions"],
            dynamic_axes={
                "x": {0: "num_nodes"},
                "edge_index": {1: "num_edges"},
                "batch": {0: "num_nodes"},
            },
            opset_version=17,
        )
        print(f"ONNX model exported to {output_path}")
    except Exception as e:
        print(f"ONNX export failed ({e}), falling back to TorchScript...")
        scripted = torch.jit.script(model)
        ts_path = output_path.replace(".onnx", ".pt")
        scripted.save(ts_path)
        print(f"TorchScript model saved to {ts_path}")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="models/surrogate_v1.pt")
    parser.add_argument("--output", default="models/surrogate_v1.onnx")
    args = parser.parse_args()
    export_to_onnx(args.model, args.output)
```

**Step 7: Create `__init__.py` files**

Create empty `__init__.py` in each `src/` subdirectory.

**Step 8: Commit**

```bash
git add artifacts/training-pipeline/
git commit -m "feat: add Python training pipeline with GNN model, data factory, and ONNX export"
```

---

## Phase 4: Database Schema for ML

### Task 7: Add Training Examples and ML Models Tables

**Files:**
- Modify: `lib/db/src/schema/photonics.ts`
- Also fix C5: change `converged` from text to boolean

**Step 1: Add new tables and fix converged column**

Add to `lib/db/src/schema/photonics.ts`:

```typescript
// Fix C5: Change converged to boolean (requires migration)
// In simulationsTable, change line 69:
//   converged: text("converged").notNull().default("false"),
// to:
//   converged: boolean("converged").notNull().default(false),

import { boolean } from "drizzle-orm/pg-core";

// New tables for ML pipeline
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

**Step 2: Update builds.ts to handle boolean converged**

In `artifacts/api-server/src/routes/builds.ts`, line 139:
```typescript
// Change: converged: simOutput.converged.toString(),
// To:     converged: simOutput.converged,
```

And remove the string comparison on line 152:
```typescript
// Change: converged: sim.converged === "true",
// To:     converged: sim.converged,
```

And line 170:
```typescript
// Change: res.json(sims.map(s => ({ ...s, converged: s.converged === "true" })));
// To:     res.json(sims);
```

**Step 3: Verify types compile**

Run: `cd /Users/amalniazi/Downloads/Photonics-Equilibrium && pnpm run typecheck:libs`

**Step 4: Commit**

```bash
git add lib/db/src/schema/photonics.ts artifacts/api-server/src/routes/builds.ts
git commit -m "feat: add ML tables, fix converged column to boolean (C5)"
```

---

## Phase 5: API Server ML Integration

### Task 8: Add ONNX Runtime Inference Wrapper

**Files:**
- Create: `artifacts/api-server/src/lib/mlInference.ts`
- Modify: `artifacts/api-server/package.json` (add onnxruntime-node)

**Step 1: Install onnxruntime-node**

Run: `pnpm add onnxruntime-node --filter api-server`

**Step 2: Create mlInference.ts**

```typescript
// artifacts/api-server/src/lib/mlInference.ts
import * as ort from "onnxruntime-node";
import { encodeGraph, type GraphInput, type PredictionOutput } from "@workspace/ml-models";
import { logger } from "./logger.js";

let session: ort.InferenceSession | null = null;

export async function loadModel(modelPath: string): Promise<void> {
  try {
    session = await ort.InferenceSession.create(modelPath, {
      executionProviders: ["cpu"],
    });
    logger.info({ modelPath }, "ML model loaded");
  } catch (err) {
    logger.error({ err, modelPath }, "Failed to load ML model");
    session = null;
  }
}

export function isModelLoaded(): boolean {
  return session !== null;
}

export async function predict(graph: GraphInput): Promise<PredictionOutput | null> {
  if (!session) return null;

  try {
    const encoded = encodeGraph(graph);
    const numNodes = encoded.nodeFeatures.length;
    const numEdges = encoded.edgeIndex[0].length;

    const xTensor = new ort.Tensor("float32", encoded.nodeFeatures.flat(), [numNodes, 29]);
    const edgeTensor = new ort.Tensor("int64",
      BigInt64Array.from([...encoded.edgeIndex[0], ...encoded.edgeIndex[1]].map(BigInt)),
      [2, numEdges]
    );
    const batchTensor = new ort.Tensor("int64", BigInt64Array.from(new Array(numNodes).fill(0n)), [numNodes]);

    const results = await session.run({ x: xTensor, edge_index: edgeTensor, batch: batchTensor });

    const nodePreds = results.node_predictions.data as Float32Array;
    const globalPreds = results.global_predictions.data as Float32Array;

    const statusLabels: Array<"ok" | "warning" | "error"> = ["ok", "warning", "error"];

    return {
      perNode: encoded.nodeIds.map((id, i) => ({
        id,
        outputPower_dBm: nodePreds[i * 4],
        snr_dB: nodePreds[i * 4 + 1],
        phase_rad: nodePreds[i * 4 + 2],
        status: statusLabels[Math.round(Math.max(0, Math.min(2, nodePreds[i * 4 + 3])))] ?? "ok",
      })),
      global: {
        equilibriumScore: globalPreds[0],
        totalSystemLoss_dB: globalPreds[1],
        coherenceLength_mm: globalPreds[2],
        converged: globalPreds[3] > 0.5,
      },
    };
  } catch (err) {
    logger.error({ err }, "ML inference failed");
    return null;
  }
}
```

**Step 3: Commit**

```bash
git add artifacts/api-server/src/lib/mlInference.ts artifacts/api-server/package.json
git commit -m "feat: add ONNX Runtime inference wrapper for ML surrogate"
```

---

### Task 9: Add WebSocket Handler for Real-Time Predictions

**Files:**
- Create: `artifacts/api-server/src/lib/wsHandler.ts`
- Modify: `artifacts/api-server/src/index.ts`
- Modify: `artifacts/api-server/package.json` (add ws)

**Step 1: Install ws**

Run: `pnpm add ws @types/ws --filter api-server`

**Step 2: Create wsHandler.ts**

```typescript
// artifacts/api-server/src/lib/wsHandler.ts
import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";
import { predict, isModelLoaded } from "./mlInference.js";
import { logger } from "./logger.js";
import type { GraphInput } from "@workspace/ml-models";

export function setupWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server, path: "/predict/live" });

  wss.on("connection", (ws: WebSocket) => {
    logger.info("WebSocket client connected");

    ws.on("message", async (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "graph_update" && msg.nodes && msg.edges) {
          if (!isModelLoaded()) {
            ws.send(JSON.stringify({ type: "error", message: "ML model not loaded" }));
            return;
          }

          const graph: GraphInput = { nodes: msg.nodes, edges: msg.edges };
          const prediction = await predict(graph);

          if (prediction) {
            ws.send(JSON.stringify({ type: "prediction", ...prediction }));
          }
        }
      } catch (err) {
        logger.error({ err }, "WebSocket message error");
        ws.send(JSON.stringify({ type: "error", message: "Invalid message" }));
      }
    });

    ws.on("close", () => logger.info("WebSocket client disconnected"));
  });

  logger.info("WebSocket server ready at /predict/live");
}
```

**Step 3: Integrate WebSocket into server startup**

Modify `artifacts/api-server/src/index.ts` to create HTTP server and attach WebSocket:

```typescript
import { createServer } from "http";
import app from "./app.js";
import { setupWebSocket } from "./lib/wsHandler.js";
import { loadModel } from "./lib/mlInference.js";
import { logger } from "./lib/logger.js";

const port = parseInt(process.env.PORT ?? "3000", 10);
const server = createServer(app);

setupWebSocket(server);

// Optionally load ML model on startup
const modelPath = process.env.ML_MODEL_PATH;
if (modelPath) {
  loadModel(modelPath).catch(err => logger.warn({ err }, "ML model not available, running without predictions"));
}

server.listen(port, "0.0.0.0", () => {
  logger.info({ port }, `Server running on port ${port}`);
});
```

**Step 4: Commit**

```bash
git add artifacts/api-server/src/lib/wsHandler.ts artifacts/api-server/src/index.ts artifacts/api-server/package.json
git commit -m "feat: add WebSocket endpoint for real-time ML predictions"
```

---

### Task 10: Add REST Prediction and Generation Endpoints

**Files:**
- Create: `artifacts/api-server/src/routes/predict.ts`
- Create: `artifacts/api-server/src/routes/generate.ts`
- Modify: `artifacts/api-server/src/routes/index.ts`

**Step 1: Create predict.ts**

```typescript
// artifacts/api-server/src/routes/predict.ts
import { Router } from "express";
import { predict, isModelLoaded } from "../lib/mlInference.js";

const router = Router();

router.post("/", async (req, res) => {
  if (!isModelLoaded()) {
    res.status(503).json({ error: "MODEL_NOT_LOADED", message: "ML model is not available" });
    return;
  }

  const { nodes, edges } = req.body;
  if (!nodes || !edges) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "nodes and edges are required" });
    return;
  }

  const result = await predict({ nodes, edges });
  if (!result) {
    res.status(500).json({ error: "INFERENCE_ERROR", message: "Prediction failed" });
    return;
  }

  res.json(result);
});

export default router;
```

**Step 2: Create generate.ts (placeholder for cVAE)**

```typescript
// artifacts/api-server/src/routes/generate.ts
import { Router } from "express";

const router = Router();

router.post("/", async (req, res) => {
  // Placeholder — cVAE generation will be implemented after surrogate training
  res.status(501).json({
    error: "NOT_IMPLEMENTED",
    message: "Inverse design is not yet available. Train the generative model first.",
  });
});

export default router;
```

**Step 3: Register routes in index.ts**

Add to `artifacts/api-server/src/routes/index.ts`:

```typescript
import predictRouter from "./predict.js";
import generateRouter from "./generate.js";

// ... existing routes ...
router.use("/predict", predictRouter);
router.use("/generate", generateRouter);
```

**Step 4: Commit**

```bash
git add artifacts/api-server/src/routes/predict.ts artifacts/api-server/src/routes/generate.ts artifacts/api-server/src/routes/index.ts
git commit -m "feat: add REST endpoints for ML prediction and inverse design"
```

---

## Phase 6: Frontend Integration

### Task 11: Add ML Predictions to Zustand Store

**Files:**
- Modify: `artifacts/photonics-sim/src/store/use-simulator-store.ts`

**Step 1: Add predictions state and WebSocket actions**

Add to the SimulatorState interface and store:

```typescript
// New state fields
mlPredictions: PredictionOutput | null;
mlMode: 'off' | 'instant' | 'physics';
wsConnected: boolean;

// New actions
setMlPredictions: (predictions: PredictionOutput | null) => void;
setMlMode: (mode: 'off' | 'instant' | 'physics') => void;
setWsConnected: (connected: boolean) => void;
```

**Step 2: Commit**

```bash
git add artifacts/photonics-sim/src/store/use-simulator-store.ts
git commit -m "feat: add ML prediction state to simulator store"
```

---

### Task 12: Add WebSocket Hook and Real-Time Canvas Overlay

**Files:**
- Create: `artifacts/photonics-sim/src/hooks/use-ml-predictions.ts`
- Modify: `artifacts/photonics-sim/src/components/canvas/CircuitCanvas.tsx`
- Modify: `artifacts/photonics-sim/src/components/panels/SimulationPanel.tsx`

This task creates the WebSocket connection hook and overlays ML predictions on the circuit canvas as color-coded power levels and warning badges.

**Step 1: Create the WebSocket hook**

**Step 2: Add prediction overlay to CircuitCanvas (color-coded edges, power labels)**

**Step 3: Add ML/Physics toggle to SimulationPanel**

**Step 4: Commit**

```bash
git add artifacts/photonics-sim/src/hooks/use-ml-predictions.ts artifacts/photonics-sim/src/components/
git commit -m "feat: add real-time ML prediction overlay to circuit canvas"
```

---

### Task 13: Create Inverse Design Panel (Placeholder UI)

**Files:**
- Create: `artifacts/photonics-sim/src/components/panels/InverseDesignPanel.tsx`
- Modify: `artifacts/photonics-sim/src/pages/editor.tsx` (add panel tab)

**Step 1: Create the panel with form for target specs**

**Step 2: Wire into editor page as a new tab**

**Step 3: Commit**

```bash
git add artifacts/photonics-sim/src/components/panels/InverseDesignPanel.tsx artifacts/photonics-sim/src/pages/editor.tsx
git commit -m "feat: add inverse design panel placeholder UI"
```

---

## Phase 7: Security Hardening (Critical Fixes)

### Task 14: Fix CORS, JSON Limits, Input Validation

**Files:**
- Modify: `artifacts/api-server/src/app.ts`
- Modify: `artifacts/api-server/src/routes/builds.ts`

**Step 1: Lock down CORS and add body size limit**

```typescript
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(",") || "*" }));
app.use(express.json({ limit: "1mb" }));
```

**Step 2: Add Zod validation to build creation and update routes**

**Step 3: Commit**

```bash
git add artifacts/api-server/src/app.ts artifacts/api-server/src/routes/builds.ts
git commit -m "fix: add CORS origin config, JSON size limit, and Zod input validation"
```

---

## Summary of Tasks

| # | Task | Phase | Est. Time |
|---|------|-------|-----------|
| 1 | Add Vitest to API server | 1: Fix Engine | 15 min |
| 2 | Fix coherence length formula (C4) | 1: Fix Engine | 20 min |
| 3 | Implement topological sort + graph propagation (I4) | 1: Fix Engine | 45 min |
| 4 | Add edge case tests | 1: Fix Engine | 15 min |
| 5 | Create `lib/ml-models` package | 2: ML Types | 30 min |
| 6 | Set up Python training pipeline | 3: Training | 60 min |
| 7 | Add ML database tables + fix converged (C5) | 4: DB Schema | 20 min |
| 8 | Add ONNX Runtime inference wrapper | 5: API Integration | 25 min |
| 9 | Add WebSocket handler for real-time predictions | 5: API Integration | 25 min |
| 10 | Add REST predict/generate endpoints | 5: API Integration | 15 min |
| 11 | Add ML predictions to Zustand store | 6: Frontend | 15 min |
| 12 | Add WebSocket hook + canvas overlay | 6: Frontend | 45 min |
| 13 | Create inverse design panel (placeholder) | 6: Frontend | 20 min |
| 14 | Fix CORS, JSON limits, input validation | 7: Security | 20 min |

**Total estimated: ~6 hours of implementation**

After implementation, the workflow to actually train a model is:
1. Start the API server
2. Run `python -m src.data_factory.circuit_generator --num-examples 10000`
3. Run `python -m src.training.train_surrogate --data data/training_data.jsonl --epochs 100`
4. Run `python -m src.training.export_onnx --model models/surrogate_v1.pt`
5. Start server with `ML_MODEL_PATH=models/surrogate_v1.onnx`
6. Open frontend — real-time predictions should appear on the canvas
