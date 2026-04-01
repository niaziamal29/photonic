# ML-Powered Photonics Circuit Surrogate & Generative Design Engine

**Date:** 2026-03-24
**Status:** Design
**Author:** Photonics-Equilibrium Team

---

## 1. Problem Statement

The current photonics simulation engine processes circuits by iterating components in array order without traversing the actual circuit graph. Each simulation run is synchronous, blocking, and scales linearly with circuit complexity. Users cannot get real-time feedback while designing, and there is no way to ask "what circuit achieves X?" (inverse design).

**Goal:** Train an ML system that can:
1. **Instantly predict** circuit performance (forward surrogate) — replacing the physics engine for real-time canvas feedback
2. **Generate novel circuit topologies** (inverse design) — given desired specs, produce circuits that achieve them, including configurations no human has explicitly designed

**Staged approach:**
- **Stage 1:** Circuit-level forward surrogate (component-level behavior + graph propagation)
- **Stage 2:** Device-level physics plugin (electromagnetic field modeling within components)

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (React)                       │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │  Circuit  │  │  Real-time   │  │  Inverse Design   │  │
│  │  Canvas   │──│  Predictions │  │  Panel            │  │
│  │(ReactFlow)│  │  Overlay     │  │  "Design me X"    │  │
│  └──────────┘  └──────┬───────┘  └────────┬──────────┘  │
└────────────────────────┼──────────────────┼──────────────┘
                         │ WebSocket        │ REST
┌────────────────────────┼──────────────────┼──────────────┐
│                   API Server (Express)                    │
│  ┌─────────────────────┴──────────────────┴────────────┐ │
│  │              ML Inference Router                      │ │
│  │  ┌──────────────┐        ┌────────────────────┐     │ │
│  │  │   Forward     │        │   Inverse/Generative│     │ │
│  │  │   Surrogate   │        │   Model             │     │ │
│  │  │   (GNN)       │        │   (cVAE/Diffusion)  │     │ │
│  │  └──────┬───────┘        └────────┬───────────┘     │ │
│  └─────────┼─────────────────────────┼─────────────────┘ │
│            │                         │                    │
│  ┌─────────┴─────────────────────────┴─────────────────┐ │
│  │            ONNX Runtime (Node.js)                    │ │
│  │            or Python Microservice (FastAPI)           │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  Physics Engine (corrected) — training oracle        │ │
│  │  + Synthetic Data Generator                          │ │
│  └─────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────┘
                         │
┌────────────────────────┼──────────────────────────────────┐
│              Training Pipeline (offline)                   │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │  Data Factory │  │  Model       │  │  Export to     │  │
│  │  (circuit     │──│  Training    │──│  ONNX/         │  │
│  │   generator)  │  │  (PyTorch)   │  │  TorchScript   │  │
│  └──────────────┘  └──────────────┘  └────────────────┘  │
└───────────────────────────────────────────────────────────┘
```

---

## 3. Design Decisions

### 3.1 Why Graph Neural Networks for the Forward Surrogate

Photonic circuits are directed graphs: components are nodes, optical connections are edges. GNNs are the natural representation because:

- **Topology-agnostic:** A single trained model handles circuits of any size and shape — 3 components or 300
- **Permutation-invariant:** Node ordering doesn't matter (unlike the current array-iteration bug)
- **Message passing = signal propagation:** GNN message passing directly mirrors how optical signals propagate through a circuit — power flows from sources through waveguides/splitters/modulators to detectors
- **Proven in circuit simulation:** MeshGraphNets (2010.03409) and GNN Circuit Link Prediction (2504.10240) validate this for physics and circuit domains

**Architecture:** Message Passing Neural Network (MPNN) variant
- Node features: component type (one-hot), parameters (wavelength, power, loss, bandwidth, etc.)
- Edge features: connection type, fiber length/loss
- Readout: per-node predictions (output power, SNR, phase) + global prediction (equilibrium score, total loss, convergence)

### 3.2 Why Conditional VAE for Inverse/Generative Design

For generating novel circuits from specs, we need a model that:
- Handles variable-size discrete structures (graphs of different sizes)
- Conditions on continuous targets (wavelength, power, SNR)
- Produces diverse, valid outputs (multiple circuits can achieve the same spec)

**Conditional Variational Autoencoder (cVAE)** over a graph latent space:
- Encoder: GNN that maps circuit → latent vector z
- Decoder: Autoregressive graph generator that builds circuits node-by-node
- Condition: Target specs (wavelength, power, SNR, component budget) injected via concatenation to z
- At inference: Sample z from prior, condition on user specs, decode to novel circuit

**Why not diffusion?** Diffusion models (per 2401.13171) are stronger for continuous geometric design (device shapes). For discrete graph structures with typed nodes, cVAEs are simpler, faster to train, and have proven graph generation capability. Diffusion can be added in Stage 2 for device-level geometry.

### 3.3 Inference Runtime: ONNX Runtime in Node.js

**Decision:** Run inference in-process via `onnxruntime-node` rather than a separate Python microservice.

**Rationale:**
- Eliminates network hop latency (critical for real-time canvas feedback)
- Single deployment artifact (no Python sidecar to manage)
- ONNX Runtime supports the full GNN/cVAE architecture
- Falls back to Python FastAPI microservice only if model complexity exceeds ONNX capabilities

**Fallback:** If ONNX proves insufficient (e.g., custom ops), deploy a FastAPI sidecar with `torch.jit` models behind a Unix socket.

### 3.4 Real-Time Feedback via WebSocket

**Decision:** Add a WebSocket endpoint that streams predictions as the user edits the circuit.

- On every node add/remove/connect/parameter change, the frontend sends the current graph state
- Server runs the GNN forward pass (~1-5ms for typical circuits)
- Returns per-node predictions + global metrics
- Frontend overlays results on the canvas in real-time (color-coded power levels, warning badges)

This replaces the current "click Run Simulation → wait → see results" flow with live feedback.

---

## 4. Data Pipeline: The Synthetic Data Factory

### 4.1 Circuit Generator

A programmatic generator that creates valid random circuits by:

1. **Selecting a topology template:** linear chain, tree, mesh, ring, Mach-Zehnder interferometer, star coupler, etc.
2. **Parameterizing randomly:** component count (2-50), wavelengths (850-1650nm), power levels, modulation rates, coupling ratios
3. **Connecting with constraints:** ensuring physical validity (output ports connect to input ports, no floating nodes, wavelength compatibility)
4. **Adding controlled noise:** slight parameter variations to teach robustness

**Target:** 500K-1M circuit-result pairs for Stage 1.

### 4.2 Physics Oracle (Corrected Engine)

Before generating training data, the current engine must be fixed:

- **Fix C4:** Correct coherence length formula to `L_c = c / delta_nu`
- **Fix I4:** Implement topological sort and actual power propagation through the connection graph
- **Validate:** Unit test against known analytical solutions (e.g., 3dB splitter should halve power)

The corrected engine becomes the "oracle" that labels each synthetic circuit with ground-truth results.

### 4.3 Data Schema

```typescript
interface TrainingExample {
  // Input: circuit graph
  graph: {
    nodes: Array<{
      id: string;
      type: ComponentType; // laser_source, waveguide, beam_splitter, ...
      params: Record<string, number>; // wavelength, power, loss, bandwidth, ...
    }>;
    edges: Array<{
      source: string;
      target: string;
      sourcePort: string;
      targetPort: string;
    }>;
  };

  // Output: simulation results (labels)
  results: {
    perNode: Array<{
      id: string;
      outputPower_dBm: number;
      snr_dB: number;
      phase_rad: number;
      status: 'ok' | 'warning' | 'error';
    }>;
    global: {
      equilibriumScore: number;     // 0-100
      totalSystemLoss_dB: number;
      coherenceLength_mm: number;
      converged: boolean;
      issues: Array<{ severity: string; message: string }>;
    };
  };

  // Metadata
  meta: {
    topology: string;       // template name
    componentCount: number;
    generatedAt: string;    // ISO timestamp
  };
}
```

### 4.4 External Data Augmentation

Supplement synthetic data with the 3 relevant HF datasets:

| Dataset | Use |
|---------|-----|
| **IDEALLab/photonics_2d_120_120_v0** | Transfer learning — pre-train encoder on real photonic optimization landscapes |
| **jungtaekkim/datasets-nanophotonic-structures** | Stage 2 device-level training data (spectral responses) |
| **Taylor658/SiN-photonic-waveguide-loss-efficiency** | Calibrate waveguide component model with real SiN data (90K samples) |

---

## 5. Model Architecture Details

### 5.1 Forward Surrogate (GNN)

```
Input Graph (N nodes, E edges)
    │
    ▼
┌──────────────────────┐
│  Node Encoder        │  MLP: [type_onehot ∥ params] → h₀ ∈ R^128
│  Edge Encoder        │  MLP: [edge_features] → e₀ ∈ R^64
└──────────┬───────────┘
           │
           ▼  (×6 message passing layers)
┌──────────────────────┐
│  MPNN Layer          │  m_ij = MLP([h_i ∥ h_j ∥ e_ij])
│                      │  h_i' = GRU(h_i, Σ_j m_ij)
└──────────┬───────────┘
           │
           ├──► Per-Node Head: MLP → [power, snr, phase, status]
           │
           └──► Global Head: mean-pool + MLP → [eq_score, loss, coherence, converged]
```

- **Parameters:** ~2M (lightweight enough for CPU inference in <5ms)
- **Training:** MSE loss on continuous outputs + cross-entropy on categorical (status, converged)
- **Regularization:** Dropout (0.1), edge dropout during training for robustness

### 5.2 Generative Model (cVAE)

```
┌─────────────────────────────────────────────┐
│  ENCODER (training only)                     │
│  GNN(circuit) → μ, σ ∈ R^256               │
│  z = μ + σ·ε    (reparameterization trick)  │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────┐
│  DECODER (inference)                          │
│  Input: [z ∥ condition_vector]               │
│  condition = [target_wavelength,              │
│               target_power,                   │
│               target_snr,                     │
│               max_components,                 │
│               topology_hint (optional)]       │
│                                               │
│  Autoregressive graph generation:             │
│  1. Predict num_nodes                         │
│  2. For each node: predict type + params      │
│  3. For each pair: predict edge existence      │
│  4. Apply validity mask (physical constraints) │
└──────────────────────────────────────────────┘
```

- **Parameters:** ~8M
- **Training:** ELBO = reconstruction loss + KL divergence
- **Validity enforcement:** Hard mask preventing physically impossible connections (e.g., detector→laser)
- **Diversity:** Sample multiple z values for same condition → diverse circuit proposals

### 5.3 Verification Loop

Generated circuits are validated by running them through the forward surrogate (fast) and optionally the physics engine (accurate):

```
User specs → cVAE generates 10 candidates
    → Forward surrogate scores each in ~1ms
    → Top 3 presented to user
    → User selects one → physics engine verifies (optional)
```

---

## 6. Integration with Existing Codebase

### 6.1 New Packages

```
lib/
  ml-models/                    # NEW: shared ML types and utilities
    src/
      types.ts                  # TrainingExample, GraphInput, PredictionOutput
      graphEncoder.ts           # Convert ReactFlow nodes/edges → GNN input format
      graphDecoder.ts           # Convert GNN output → ReactFlow nodes/edges
    package.json

artifacts/
  training-pipeline/            # NEW: Python training scripts
    src/
      data_factory/
        circuit_generator.py    # Random valid circuit generator
        topology_templates.py   # Predefined topology patterns
        augmentation.py         # Parameter noise, topology mutations
      models/
        forward_gnn.py          # PyTorch GNN surrogate
        generative_cvae.py      # PyTorch cVAE
      training/
        train_surrogate.py      # Training loop for forward model
        train_generative.py     # Training loop for cVAE
        export_onnx.py          # Export to ONNX format
      evaluation/
        metrics.py              # MAE, R², topology validity rate
        benchmarks.py           # Compare ML vs physics engine
    requirements.txt
    pyproject.toml

  api-server/
    src/
      lib/
        mlInference.ts          # NEW: ONNX Runtime wrapper
        wsHandler.ts            # NEW: WebSocket real-time predictions
      routes/
        predict.ts              # NEW: REST prediction endpoints
        generate.ts             # NEW: Inverse design endpoints
```

### 6.2 API Endpoints (New)

```yaml
# Forward prediction
POST /predict
  body: { nodes: [...], edges: [...] }
  returns: { perNode: [...], global: {...} }

# WebSocket for real-time
WS /predict/live
  send: { type: 'graph_update', nodes: [...], edges: [...] }
  receive: { type: 'prediction', perNode: [...], global: {...} }

# Inverse design
POST /generate
  body: {
    targetWavelength: 1550,
    targetPower: -3,
    targetSNR: 30,
    maxComponents: 10,
    numCandidates: 5
  }
  returns: {
    candidates: [
      { circuit: { nodes, edges }, predictedScore: 87, confidence: 0.92 },
      ...
    ]
  }
```

### 6.3 Frontend Changes

- **CircuitCanvas:** Add real-time prediction overlay (power levels as color gradients on edges, warning badges on nodes)
- **SimulationPanel:** Add toggle: "ML Instant" vs "Physics Engine" mode
- **New Panel: InverseDesignPanel** — form for target specs → generates circuit candidates → user clicks to load into canvas
- **Store:** Add `predictions` state for live ML results, separate from `simulationResults` (physics engine)

### 6.4 Database Changes

```sql
-- New table for training data
CREATE TABLE training_examples (
  id SERIAL PRIMARY KEY,
  graph JSONB NOT NULL,
  results JSONB NOT NULL,
  topology TEXT NOT NULL,
  component_count INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'synthetic', -- 'synthetic' | 'user' | 'external'
  created_at TIMESTAMP DEFAULT NOW()
);

-- New table for model versions
CREATE TABLE ml_models (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,           -- 'forward_surrogate_v1', 'generative_cvae_v1'
  version TEXT NOT NULL,
  onnx_path TEXT NOT NULL,
  metrics JSONB NOT NULL,       -- { mae_power: 0.3, r2_score: 0.97, ... }
  active BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 7. Training Strategy

### 7.1 Stage 1: Forward Surrogate

| Phase | Data | Duration | Target Metric |
|-------|------|----------|---------------|
| **1a. Fix physics engine** | N/A | 1 week | Unit tests pass for known analytical cases |
| **1b. Build data factory** | Generate 100K circuits | 1 week | Valid circuit rate > 99% |
| **1c. Train GNN v1** | 100K examples | 2-3 days (GPU) | MAE < 1 dB power, R² > 0.95 |
| **1d. Scale data + retrain** | Generate 500K circuits | 1 week | MAE < 0.5 dB, R² > 0.98 |
| **1e. Export + integrate** | N/A | 1 week | Inference < 5ms, WebSocket working |

### 7.2 Stage 1: Generative Model

| Phase | Data | Duration | Target Metric |
|-------|------|----------|---------------|
| **1f. Train cVAE** | Same 500K circuits | 3-5 days (GPU) | Validity rate > 90%, diversity > 0.7 |
| **1g. Verification loop** | N/A | 3 days | Top-3 candidates meet specs > 80% of the time |
| **1h. UI integration** | N/A | 1 week | Inverse design panel functional |

### 7.3 Stage 2: Device-Level Physics (Future)

- Pre-train on jungtaekkim/datasets-nanophotonic-structures
- Add FDTD simulation capability (via MEEP or Lumerical API)
- Train device-level surrogates for individual component types
- Plug into the circuit-level GNN as learned component models

---

## 8. Continuous Learning Loop

Once deployed, the system improves itself:

```
User designs circuit in canvas
    → ML predicts instantly (forward surrogate)
    → User clicks "Verify with Physics Engine"
    → Physics engine runs full simulation
    → (prediction, ground_truth) pair saved to training_examples
    → Periodic retraining on accumulated user data
    → Model improves on real-world circuit patterns
```

This creates a flywheel: more users → more data → better model → better UX → more users.

---

## 9. Technology Choices

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Training framework** | PyTorch + PyG (PyTorch Geometric) | Best GNN ecosystem, ONNX export support |
| **GNN architecture** | MPNN with GRU aggregation | Proven for physics simulation (MeshGraphNets) |
| **Generative model** | Conditional VAE | Simpler than diffusion for discrete graphs, fast sampling |
| **Inference runtime** | ONNX Runtime (Node.js) | In-process, no Python sidecar, <5ms latency |
| **Real-time transport** | WebSocket (ws library) | Already in Node ecosystem, low-latency bidirectional |
| **Training compute** | HF Jobs or cloud GPU (A100/H100) | PyTorch Geometric needs GPU for training |
| **Data storage** | PostgreSQL JSONB + Parquet exports | Consistent with existing stack, Parquet for training |
| **Model registry** | ml_models table + file storage | Simple, no MLflow overhead needed initially |

---

## 10. Success Criteria

### Stage 1 Complete When:

- [ ] Forward surrogate achieves MAE < 0.5 dB on held-out circuits and R² > 0.98
- [ ] Inference latency < 5ms for circuits up to 50 components
- [ ] Real-time canvas overlay shows live predictions as user edits
- [ ] Generative model produces valid circuits > 90% of the time
- [ ] Generated circuits meet target specs within 10% tolerance > 80% of the time
- [ ] User can type specs and receive 3-5 diverse circuit proposals in < 1 second
- [ ] Continuous learning pipeline saves user-verified results for retraining

### Stage 2 Complete When:

- [ ] Device-level surrogate trained on FDTD data for at least 5 component types
- [ ] Component-level surrogates plugged into circuit GNN as differentiable modules
- [ ] System can suggest novel component geometries (not just circuit topologies)

---

## 11. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Physics engine bugs propagate to training data | High | Critical | Fix engine first, validate against analytical solutions before any data generation |
| GNN doesn't generalize to unseen topologies | Medium | High | Diverse topology templates, edge dropout regularization, test on held-out topologies |
| ONNX export loses fidelity | Low | Medium | Numerical comparison tests between PyTorch and ONNX outputs |
| cVAE mode collapse (generates same circuits) | Medium | Medium | KL annealing, diverse training data, explicit diversity loss term |
| Real-time WebSocket adds server load | Low | Low | Debounce client sends (50ms), lightweight model, horizontal scaling |
| Insufficient training data diversity | Medium | High | 15 topology templates × wide parameter ranges × augmentation = combinatorial diversity |

---

## 12. References

- **OptoGPT** (2304.10294) — Foundation transformer for optical inverse design
- **OL-Transformer** (2305.11984) — Universal optical surrogate with 6x speedup
- **MeshGraphNets** (2010.03409) — GNN for mesh-based physics simulation
- **GNN Circuit Link Prediction** (2504.10240) — GNNs for circuit topology
- **Compositional Generative Inverse Design** (2401.13171) — Diffusion for multi-component systems
- **OSIRIS** (2601.19439) — Dataset generation pipeline from circuit simulations
- **IDEALLab/photonics_2d_120_120_v0** — Photonic topology optimization benchmark
- **Taylor658/SiN-photonic-waveguide-loss-efficiency** — Waveguide calibration data
