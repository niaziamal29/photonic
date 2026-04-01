# Architecture Overview

This document explains how the codebase is organized, what each part does, and how they connect to each other. Useful for anyone who wants to contribute code.

## System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                               │
│                                                              │
│   ┌──────────────────────────────────────────────────────┐  │
│   │              Frontend (React + Vite)                  │  │
│   │                                                      │  │
│   │  Dashboard ─── Editor ─── Canvas ─── Panels          │  │
│   │                  │                                    │  │
│   │          Zustand Store (state management)             │  │
│   │                  │                                    │  │
│   │      React Query (auto-generated API hooks)          │  │
│   └──────────────────┼───────────────────────────────────┘  │
└──────────────────────┼───────────────────────────────────────┘
                       │ HTTP (REST)
                       ▼
┌──────────────────────────────────────────────────────────────┐
│                   Backend (Express 5)                         │
│                                                              │
│   Routes: /builds, /builds/:id/simulate, /predict            │
│      │              │                    │                    │
│      ▼              ▼                    ▼                    │
│   Database     Physics Engine      ML Inference              │
│   (Drizzle)   (photonicsEngine)   (ONNX Runtime)            │
│      │                                   │                    │
│      ▼                                   │                    │
│   PostgreSQL                             │                    │
└──────────────────────────────────────────┼───────────────────┘
                                           │
                       ┌───────────────────┘
                       ▼
┌──────────────────────────────────────────────────────────────┐
│              Training Pipeline (Python)                       │
│                                                              │
│   Data Factory → Train Surrogate → Export ONNX → .onnx file │
│                                                              │
│   (Also: Generative CVAE, Active Learning, Evaluation)       │
└──────────────────────────────────────────────────────────────┘
```

---

## The Three Main Parts

### 1. Frontend (`artifacts/photonics-sim/`)

**What:** A React single-page app that runs in the browser. This is what users see and interact with.

**Tech stack:** React 19, Vite (build tool), TypeScript, Tailwind CSS v4, React Flow v12 (circuit canvas), Zustand (state), React Query v5 (API calls), Wouter (routing).

**Key files:**

| File | What It Does |
|------|-------------|
| `src/pages/dashboard.tsx` | Lists all circuit builds. Create/delete builds. |
| `src/pages/editor.tsx` | Main circuit design page. Composes all the panels. |
| `src/store/use-simulator-store.ts` | Global state: nodes, edges, selection, simulation results, ML mode. |
| `src/components/canvas/CircuitCanvas.tsx` | React Flow wrapper. Handles drag-drop, wiring, zoom/pan. |
| `src/components/canvas/PhotonNode.tsx` | Custom node rendering for each component type. |
| `src/components/panels/ComponentLibrary.tsx` | Draggable catalog of optical components. |
| `src/components/panels/PropertiesPanel.tsx` | Edit parameters of the selected component. |
| `src/components/panels/SimulationPanel.tsx` | Run simulation, see results. |
| `src/components/panels/DiagnosticsPanel.tsx` | Shows errors, warnings, suggestions. |
| `src/components/panels/InverseDesignPanel.tsx` | ML-based circuit generation (future feature). |

**How it talks to the backend:** Auto-generated React Query hooks (from the OpenAPI spec) in `lib/api-client-react/`. These hooks handle caching, loading states, and error handling automatically.

---

### 2. Backend (`artifacts/api-server/`)

**What:** A REST API server that stores circuits, runs simulations, and serves ML predictions.

**Tech stack:** Express 5, TypeScript, Drizzle ORM (database), Zod (validation), Pino (logging), Helmet (security), ONNX Runtime (ML inference).

**Key files:**

| File | What It Does |
|------|-------------|
| `src/index.ts` | Entry point. Loads config, starts server, optionally loads ML model. |
| `src/routes/builds.ts` | CRUD for circuit builds + simulate endpoint. |
| `src/routes/components.ts` | Returns the catalog of 15 optical component types. |
| `src/routes/predict.ts` | ML prediction endpoint. Falls back to physics engine if no model loaded. |
| `src/lib/photonicsEngine.ts` | **The core physics engine.** Topological sort → power propagation → metrics. |
| `src/lib/mlInference.ts` | Loads ONNX model, runs inference, decodes predictions. |

**API Endpoints:**

| Method | Path | What It Does |
|--------|------|-------------|
| GET | `/api/healthz` | Health check |
| GET | `/api/components` | List all 15 component types with their parameters |
| GET | `/api/builds` | List all circuit builds |
| POST | `/api/builds` | Create a new build |
| GET | `/api/builds/:id` | Get a single build |
| PUT | `/api/builds/:id` | Update a build (components, connections, name, etc.) |
| DELETE | `/api/builds/:id` | Delete a build |
| POST | `/api/builds/:id/simulate` | Run simulation on a build |
| GET | `/api/builds/:id/simulations` | Get simulation history for a build |
| POST | `/api/predict` | Get ML prediction for a circuit (or physics fallback) |
| GET | `/api/predict/status` | Check if ML model is loaded |

**How simulation works (simplified):**
1. Receive circuit (components + connections).
2. Topologically sort components (figure out the order light flows through them).
3. Start at the laser(s). Set initial power.
4. Walk through each component in order. At each step, calculate: power out = power in - loss + gain, phase changes, and any issues.
5. Collect all per-component results and compute global metrics (total loss, SNR, equilibrium score).
6. Return everything as JSON.

---

### 3. Training Pipeline (`artifacts/training-pipeline/`)

**What:** Python code that generates training data, trains ML models, and exports them for deployment.

**Tech stack:** Python 3.10+, PyTorch 2.4+, PyTorch Geometric 2.6+, FastAPI (optional serving).

**Key files:**

| File | What It Does |
|------|-------------|
| `src/data_factory/circuit_generator.py` | Generates random circuits, simulates them via API, saves results. |
| `src/data_factory/topology_templates.py` | Six circuit templates for diverse data generation. |
| `src/models/forward_gnn.py` | The GNN model architecture (~2M parameters). |
| `src/models/generative_cvae.py` | The CVAE model for inverse design (experimental). |
| `src/training/train_surrogate.py` | Training loop: data loading, loss computation, checkpointing. |
| `src/training/export_onnx.py` | Converts PyTorch model → ONNX format. |
| `src/evaluation/metrics.py` | Measures model accuracy against physics engine. |
| `src/serve/app.py` | FastAPI server for model inference (alternative deployment). |
| `src/active_learning/` | Experimental: smart data collection based on model uncertainty. |

---

## Shared Libraries (`lib/`)

These are used by both the frontend and backend.

| Library | What It Does |
|---------|-------------|
| `lib/db/` | Database schema definition using Drizzle ORM. Defines the `builds`, `simulations`, `trainingExamples`, and `mlModels` tables. |
| `lib/ml-models/` | TypeScript code that encodes circuits into tensors for ML. Shared between the backend (for ONNX inference) and the data pipeline. |
| `lib/api-spec/` | OpenAPI specification. The single source of truth for the API contract. |
| `lib/api-client-react/` | Auto-generated React Query hooks from the OpenAPI spec (via Orval). |
| `lib/api-zod/` | Auto-generated Zod validation schemas from the OpenAPI spec. |

---

## Database Schema

Four tables, all defined in `lib/db/src/schema/photonics.ts`:

### `builds`
Stores circuit designs.
- `id`, `name`, `description`
- `layout` (JSONB): The full circuit — components with their positions and parameters, plus connections.
- `targetWavelength`, `targetPower`, `targetSNR`: Design goals.
- `equilibriumScore`, `status` (draft / simulating / converged / needs_revision)
- `iterationCount`: How many times it's been simulated.

### `simulations`
Stores the result of every simulation run.
- Links to a build via `buildId`.
- Stores all numeric results: power, loss, SNR, coherence, score, convergence.
- `componentResults` (JSONB): Per-component power/phase/status.
- `issues` and `suggestions` (JSONB): Diagnostics.

### `trainingExamples`
Stores circuit-result pairs for ML training.
- `graph` (JSONB): The circuit definition.
- `results` (JSONB): Simulation results.
- `topology`, `componentCount`, `source`, `qualityScore`: Metadata.

### `mlModels`
Registry of trained ML models.
- `name`, `version`, `modelType`, `onnxPath`
- `metrics` (JSONB): Accuracy metrics from evaluation.
- `active` (boolean): Which model is currently deployed.

---

## How Data Flows Through the System

### User designs a circuit:
```
Browser → Zustand store (nodes, edges) → PUT /api/builds/:id → PostgreSQL
```

### User runs a simulation:
```
Browser → POST /api/builds/:id/simulate → Physics Engine → results stored in PostgreSQL → response to browser
```

### ML prediction (instant mode):
```
Browser → POST /api/predict → Graph Encoder → ONNX Runtime → decoded predictions → response to browser
```

### Training data generation:
```
Python script → POST /api/builds (create) → POST /api/builds/:id/simulate → save to JSONL → DELETE /api/builds/:id
```

### Model training and deployment:
```
JSONL → PyTorch training → checkpoint.pt → export_onnx → model.onnx → backend loads at startup
```

---

## Monorepo Structure

This project uses **pnpm workspaces** to manage multiple packages in one repository. The `pnpm-workspace.yaml` file defines which folders are packages:

```yaml
packages:
  - 'artifacts/*'
  - 'lib/*'
```

This means you can reference shared libraries by name. For example, the backend imports from `@workspace/db` and `@workspace/ml-models` without specifying file paths.

**Common commands:**

```bash
# Install all dependencies for all packages
pnpm install

# Run a command in a specific package
pnpm --filter @workspace/api-server dev
pnpm --filter @workspace/photonics-sim build

# Run a command in all packages
pnpm -r build
```

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | Yes | — | Port for the API server (e.g., 3000) |
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `ALLOWED_ORIGINS` | No | `http://localhost:5173` | CORS whitelist (comma-separated) |
| `ML_MODEL_PATH` | No | — | Path to ONNX model file. If not set, ML predictions fall back to physics. |
| `ML_MODEL_VERSION` | No | — | Version string for the loaded model |

---

## Where to Start Contributing

| I want to... | Start here |
|-------------|-----------|
| Fix a frontend bug | `artifacts/photonics-sim/src/` |
| Add a new component type | `artifacts/api-server/src/lib/photonicsEngine.ts` + `src/routes/components.ts` |
| Improve the physics engine | `artifacts/api-server/src/lib/photonicsEngine.ts` |
| Improve the ML model | `artifacts/training-pipeline/src/models/forward_gnn.py` |
| Add a new topology template | `artifacts/training-pipeline/src/data_factory/topology_templates.py` |
| Change the database schema | `lib/db/src/schema/photonics.ts` |
| Update the API contract | `lib/api-spec/` then regenerate clients |
| Fix ML encoding/decoding | `lib/ml-models/src/graphEncoder.ts` |

---

## Next Steps

- **New to the project?** → [Getting Started](./getting-started.md)
- **Want to design circuits?** → [Circuit Guide](./circuit-guide.md)
- **Want to train models?** → [ML Training Guide](./ml-training-guide.md)
