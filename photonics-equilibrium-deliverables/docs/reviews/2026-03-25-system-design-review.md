# Photonics Equilibrium — System Design Review

**Date:** 2026-03-25
**Reviewer:** AXIOM (independent review of Opus 4.6 1M-context session output)
**Scope:** Full codebase audit + ML roadmap evaluation
**Verdict:** The roadmap is architecturally sound but has critical sequencing gaps and several design decisions that need revision before implementation begins.

---

## Executive Summary

The prior session produced two planning artifacts: a design doc (`ml-photonics-surrogate-design.md`) and a 14-task implementation plan (`ml-photonics-implementation.md`). Both demonstrate strong domain understanding and a coherent vision: fix the physics engine, generate synthetic training data, train a GNN forward surrogate, add a cVAE generative model, and integrate both into the existing Express/React app.

After reading every source file in the monorepo, I've identified **5 critical issues** the roadmap gets right but underspecifies, **8 design decisions I'd change**, and **3 structural risks** the plan doesn't address. The physics engine bugs are real and correctly prioritized. The ML architecture choices are defensible but the cVAE selection over diffusion for graph generation is weaker than the doc claims. The ONNX-in-Node.js inference strategy is the right call for stage 1 but will hit walls at stage 2.

---

## 1. Codebase Health Assessment

### 1.1 What's Actually There

The monorepo has 3 app artifacts and 4 shared libraries:

```
artifacts/
  api-server/          Express API, physics engine, component library
  photonics-sim/       React + ReactFlow frontend
  mockup-sandbox/      shadcn/ui component sandbox
lib/
  api-client-react/    Generated React Query hooks (Orval)
  api-spec/            OpenAPI spec + Orval config
  api-zod/             Generated Zod schemas
  db/                  Drizzle ORM schema + connection
```

The OpenAPI-first design with Orval codegen is a genuine strength — it gives you type-safe API contracts across the stack for free. The monorepo structure is clean. The component library data model (15 types with rich parameter descriptions, knowledge bases, and educational content) is impressively detailed and represents real domain work.

### 1.2 Confirmed Critical Bugs

**C4 — Broken coherence length formula (line 102-107 + line 367):**
The `computeCoherenceLength` function on line 102 is algebraically nonsensical. Expanding it:
```
(lambda^2 * c) / (delta_nu * lambda^2) / delta_nu / 1e-6 * c
= c / delta_nu / delta_nu / 1e-6 * c
= c^2 / (delta_nu^2 * 1e-6)
```
The correct formula is `L_c = c / delta_nu`. But line 367 has a *second* inline calculation that also gets it wrong — it repeats the same algebraic confusion. The implementation plan correctly identifies both locations and provides the right fix. This must be fixed before any training data is generated.

**I4 — No graph traversal:**
The simulation loop on line 172 (`for (const comp of components)`) iterates in array insertion order. Every non-source component sets `inputPower = 0` — the power from upstream components never reaches downstream ones. The waveguide on line 213 computes `outputPower = 0 - propagationLoss`, which is negative dBm and physically meaningless. The `connectionMap` built on lines 131-135 is never read after construction. This is the most consequential bug: every simulation result in the database is wrong because power doesn't flow through the circuit.

**C5 — `converged` stored as text:**
Line 69 of the schema defines `converged: text("converged")`. The route on line 139 does `.toString()` on the boolean, and lines 152 and 170 compare against the string `"true"`. This is a classic Drizzle footgun — it should be a boolean column.

**C1 — No input validation:**
The POST `/builds` route (line 20) does `const { name, description, ... } = req.body` with only a null check on `name` and `layout`. The `layout` field is stored directly into a JSONB column with no schema validation — any JSON structure is accepted. The PUT route has zero validation. Since `layout` is later cast to `CircuitLayout` on line 123, a malformed layout will crash the simulation engine at runtime with an unhelpful error.

**C2/C3 — CORS and body size:**
Line 28: `app.use(cors())` — allows any origin. Line 29: `express.json()` with no `limit` — default is 100KB in Express 5, but this should be explicit and probably tighter for this use case. These are real but lower priority than engine correctness.

### 1.3 Additional Issues Found During Audit

**`onNodesChange`/`onEdgesChange` in Zustand store are dead code.** Lines 59-66 of `use-simulator-store.ts` implement these as no-ops that return the same state. The actual change handlers in `CircuitCanvas.tsx` (lines 32-38) correctly use `applyNodeChanges`/`applyEdgeChanges` from ReactFlow and call `setNodes`/`setEdges` directly. The store methods should be removed to avoid confusion.

**Node ID collision risk.** `CircuitCanvas.tsx` line 69: `id: \`node-${Date.now()}\`` — if a user drags two components onto the canvas within the same millisecond, IDs collide. Use `crypto.randomUUID()` or a counter.

**`ICON_MAP` duplicated.** `PhotonNode.tsx` lines 11-27 and `ComponentLibrary.tsx` lines 10-26 define identical icon maps. Extract to a shared constant.

**`MetricBox` and `DiagnosticsPanel` use `any` types.** `SimulationPanel.tsx` line 190: `function MetricBox({ ... }: any)`. `DiagnosticsPanel.tsx` lines 34-36, 59, 93 all cast to `any`. These should be typed.

**Missing database index.** `simulationsTable` has no index on `buildId`. The `GET /:buildId/simulations` query filters by `buildId` — without an index, this becomes a full table scan as data grows.

**DELETE returns 204 even when the build doesn't exist.** Line 97 of `builds.ts` — `db.delete()` returns silently if the row doesn't exist. Should check affected rows and return 404.

**`useEffect` dependency array.** `editor.tsx` line 71: `}, [build?.id])` — this depends on `build?.id` but calls `setActiveBuild`, `setNodes`, `setEdges`, and `clearWorkspace`, none of which are in the dependency array. ESLint's `exhaustive-deps` rule would flag this. In practice it works because Zustand's actions are stable references, but it's a maintenance trap.

---

## 2. ML Roadmap — Architecture Review

### 2.1 Forward Surrogate: GNN — Correct Choice

The decision to use a Message Passing Neural Network for the forward model is well-justified. Circuits *are* graphs. The MPNN variant with GRU aggregation (MeshGraphNets-style) is proven for physics simulation tasks and maps naturally to optical signal propagation.

**Design doc says ~2M params, <5ms inference.** This is realistic for circuits up to ~50 nodes on CPU via ONNX Runtime. The node feature vector design (15 one-hot type + 13 params = 28 features, encoded to 128-dim) is reasonable. Six message-passing layers give a receptive field of 6 hops, which covers virtually any practical photonic circuit topology.

**What I'd change:**

The design doc specifies 6 MPNN layers, but the earlier brainstorming session mentioned 4 GATv2Conv layers + 2 Transformer layers. The design doc dropped the transformer head entirely and went pure MPNN. I'd keep the transformer head — it costs very little parameter budget (~200K extra) but gives the global readout (equilibrium score, total system loss) a much better inductive bias than mean-pooling alone. Mean-pooling over node embeddings loses permutation-equivariant information about the graph structure. A 2-layer self-attention over node embeddings (Set Transformer style) captures global interactions that matter for equilibrium assessment.

**Recommendation:** Restore the GNN + Transformer Head architecture from the brainstorming session. The design doc's pure MPNN simplification was premature.

### 2.2 Generative Model: cVAE — Defensible but Weak

The design doc chose cVAE over diffusion, arguing: "For discrete graph structures with typed nodes, cVAEs are simpler, faster to train, and have proven graph generation capability."

This is partially true — cVAEs are simpler and faster. But the "proven graph generation capability" claim is dated. Since DiGress (ICML 2023) and its successors, discrete diffusion over graphs has shown significantly better diversity and quality than graph VAEs, especially for conditional generation. The autoregressive decoder in the cVAE design (predict num_nodes → predict types → predict edges) introduces an ordering bias that graph structures shouldn't have, and mode collapse in graph VAEs is a well-documented problem even with KL annealing.

**The design doc's own risk table lists mode collapse as "Medium" likelihood.** That should be a red flag — it's the primary failure mode of the architecture you've chosen.

**Recommendation:** For Stage 1, the cVAE is acceptable as a proof-of-concept since it's faster to implement. But plan the diffusion upgrade as Stage 1.5, not Stage 2. Stage 2 (device-level physics) is a completely different axis of complexity. Don't conflate "upgrade the generative architecture" with "add FDTD simulation." These are independent work streams.

### 2.3 ONNX Runtime in Node.js — Right Call, With Caveats

Running inference in-process via `onnxruntime-node` eliminates the network hop and Python sidecar complexity. For a ~2M parameter GNN doing forward passes, this is correct.

**Caveats the plan underestimates:**

1. **PyTorch Geometric's `MessagePassing` doesn't export cleanly to ONNX.** Scatter operations (scatter_add, scatter_mean) used in GNN aggregation are not natively supported in ONNX opset < 16. You'll need to either: (a) rewrite the forward pass using pure PyTorch ops that have ONNX equivalents, or (b) use `torch.jit.trace` first and then export. The plan's "export to ONNX" step is a single line item, but in practice it's 2-3 days of work to get the graph ops right.

2. **The cVAE's autoregressive decoder cannot be ONNX-exported as a single model.** The variable-length loop (predict num_nodes, then iterate) requires either: (a) exporting as multiple ONNX models (size predictor, node generator, edge generator) and orchestrating in JS, or (b) falling back to the Python sidecar for generation. The design doc's "falls back to FastAPI only if model complexity exceeds ONNX" — generation *will* exceed ONNX's comfort zone.

**Recommendation:** Plan for ONNX Runtime for the forward surrogate (works) and a Python FastAPI sidecar for the generative model (necessary). Don't design the generation endpoint around ONNX-in-Node; you'll waste time.

### 2.4 Data Factory — Mostly Sound, One Gap

The synthetic circuit generator approach is correct. 500K-1M circuits across 15 topology templates with parameter sweeps will produce sufficient diversity for a circuit-level surrogate.

**Gap: The plan doesn't specify how to handle branching topologies in the training data.** A beam splitter has two output ports; a circulator has three. The current `Connection` model uses `fromPort`/`toPort` strings but the component definitions don't declare valid port counts. The circuit generator needs a port compatibility matrix (which output ports connect to which input ports for each component type) that doesn't exist in the codebase. This is a non-trivial data modeling task that's missing from the implementation plan.

**Recommendation:** Add a Task 0.5 between the physics engine fix and the data factory: define a formal port specification for each of the 15 component types (port name, direction, allowed connections). This becomes part of the `lib/ml-models` package and drives both the circuit generator and the GNN edge feature encoding.

### 2.5 WebSocket Real-Time Predictions — Overengineered for Stage 1

The design calls for WebSocket-based streaming of predictions on every graph change. This adds a new transport layer (ws), requires debouncing logic, and creates state synchronization complexity between the WebSocket state and the Zustand store.

For Stage 1, the simpler approach: add a `POST /predict` REST endpoint that the frontend calls with the same debounce logic (50ms) via React Query's `useMutation` with `onSettled` caching. The response latency will be ~10-15ms (5ms inference + network overhead on localhost) — indistinguishable from WebSocket for the user. WebSocket becomes valuable only when you need server-initiated pushes (e.g., streaming partial results from the generative model), which is Stage 2 territory.

**Recommendation:** Replace WebSocket with REST for Stage 1. Add WebSocket in Stage 2 when generation streaming justifies it.

---

## 3. Implementation Plan — Task-Level Review

### 3.1 Phase 1 (Tasks 1-4): Fix Physics Engine — Correct and Well-Scoped

Tasks 1-4 are the right starting point and correctly sequenced. The test-first approach (write failing test → fix code → verify) is exactly right.

**One addition:** Task 3 (topological sort + power propagation) should also handle cycles. Ring resonators create cycles in the circuit graph — a simple topological sort will exclude them. The implementation plan's Kahn's algorithm will detect cycles but drop the cycled nodes. For Stage 1, the right behavior is: detect cycles, mark them as a simulation warning, and evaluate non-cycled components. For Stage 2, implement iterative convergence for feedback loops (this is what the `converged` field was presumably meant for).

### 3.2 Phase 2 (Task 5): Shared ML Types — Missing Graph Encoder Specification

Task 5 creates `lib/ml-models` with `graphEncoder.ts` and `graphDecoder.ts`. The implementation plan defines the TypeScript interfaces but doesn't specify the actual encoding logic — how do you convert 15 component types to one-hot vectors, normalize parameter ranges, or handle missing optional parameters?

**Recommendation:** Task 5 should include: (a) a `componentTypeIndex` constant mapping types to indices, (b) parameter normalization ranges (derived from the component library's `typicalRange` values), (c) a null-parameter imputation strategy (use `defaultParams` from the component library, not zeros).

### 3.3 Phase 3 (Task 6): Training Pipeline — Underscoped

Task 6 is a single task covering: Python project scaffolding, topology templates, circuit generator, GNN model definition, training loop, and ONNX export. This is 6 distinct work items compressed into one. The implementation plan provides code for the first 3 (scaffolding, templates, generator) but hand-waves the model definition and training loop as "standard PyTorch Lightning."

**Recommendation:** Split Task 6 into at minimum:
- 6a: Python scaffolding + circuit generator + generate/validate 10K circuits
- 6b: GNN model definition + single-example forward pass test
- 6c: Training loop + hyperparameter sweep on 100K circuits
- 6d: ONNX export + numerical equivalence tests

### 3.4 Phase 5 (Task 8): ONNX Runtime Wrapper — Missing Error Handling

The plan's ONNX wrapper loads a model and runs inference. It doesn't address: model version management (what happens when you retrain and deploy a new model while the server is running?), graceful degradation (if ONNX inference fails, fall back to the physics engine?), or warm-up (first inference after model load is 10-100x slower due to ONNX Runtime JIT compilation).

**Recommendation:** Add model versioning to the wrapper (load by version string, support hot-swap), add a fallback path to the physics engine, and add a warm-up call at server startup.

### 3.5 Missing Task: OpenAPI Spec Updates

The implementation plan adds new REST endpoints (`/predict`, `/generate`, `/ml/status`) but never mentions updating the OpenAPI spec. Since the project uses Orval codegen, the new endpoints won't have generated React Query hooks or Zod schemas unless the spec is updated. This is a cross-cutting task that should be called out explicitly.

---

## 4. Structural Risks Not Addressed

### 4.1 Training Data Poisoning via Active Learning

The continuous learning loop (section 8 of the design doc) saves user-verified simulation results as training data. If a user submits a circuit that triggers a physics engine bug (and we know the engine has bugs), that incorrect ground truth gets baked into the training set. The plan has no data quality gate — no outlier detection, no validation against known-good circuits, no human review for edge cases.

**Recommendation:** Add a validation step to the active learning pipeline: before adding a user circuit to training data, run it through a suite of sanity checks (energy conservation, power monotonicity through passive components, coherence length within physical bounds). Reject examples that fail.

### 4.2 No Observability Plan

The design adds ML inference to the request path but doesn't mention monitoring. What's the P95 inference latency? How often does the model produce predictions that diverge wildly from the physics engine? Is the model drifting as it sees more user circuits? None of this is planned.

**Recommendation:** Add a metrics emission layer: log inference latency per request, log prediction-vs-engine divergence when users click "Verify," track model confidence distributions over time. These feed into the active learning quality gate above.

### 4.3 No Migration Path for Existing Data

The schema changes (new `training_examples` and `ml_models` tables, fix `converged` to boolean) require a Drizzle migration. The plan mentions the SQL DDL but doesn't create migration files. More critically, the `converged` column change from text to boolean requires migrating existing simulation data — any existing rows with `converged = "true"` need to be transformed.

**Recommendation:** Add an explicit migration task with rollback plan before any schema changes.

---

## 5. Revised Roadmap Recommendation

Here's how I'd resequence the work:

| Phase | What | Delta from Original |
|-------|------|-------------------|
| 0 | Formal port spec for all 15 component types | **New** |
| 1 | Fix physics engine (C4, I4, cycles) + add Vitest | Same, plus cycle handling |
| 2 | Security hardening (C1, C2, C3, I2, I3) | Moved earlier — do this before adding new endpoints |
| 3 | Schema migration (C5 boolean fix, add indexes, new tables) | Same, with explicit migration files |
| 4 | `lib/ml-models` types + graph encoder/decoder | Same, with encoding spec |
| 5a | Python scaffolding + circuit generator + 10K validation | Split from original Task 6 |
| 5b | GNN + Transformer Head model + training loop | Split + architecture change |
| 5c | ONNX export + numerical equivalence tests | Split |
| 6 | ONNX wrapper + REST `/predict` endpoint + OpenAPI spec update | Simplified from WebSocket |
| 7 | Frontend prediction overlay + "ML Instant" toggle | Same |
| 8 | cVAE training + `/generate` endpoint (Python sidecar) | Changed runtime |
| 9 | Inverse design UI panel | Same |
| 10 | Observability + active learning with quality gates | **New** |
| 11 | Evaluate diffusion upgrade for generative model | **New** — Stage 1.5 |

---

## 6. Verdict

The prior session did excellent work. The problem analysis is thorough, the architecture choices are well-reasoned, the physics bugs are correctly identified and prioritized, and the implementation plan provides working code for the hardest tasks. The domain knowledge demonstrated (component library, physics formulas, GNN architecture selection, paper references) is strong.

The gaps are operational: missing port specifications, underscoped training pipeline tasks, missing migration/observability/validation infrastructure, and a WebSocket decision that adds complexity without proportional value in Stage 1. The cVAE choice is the weakest architectural decision — it'll work for a proof of concept but plan to replace it.

The roadmap is ready for execution with the adjustments above. Phase 0-1 (port spec + engine fixes) can start immediately and are fully specified in the existing plan.
