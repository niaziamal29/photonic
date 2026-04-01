# ML Training Guide

This guide explains how to generate training data, train the forward surrogate model, and deploy it for real-time inference. No ML expertise required to follow along — we explain every step.

## The Big Picture

Here's the full pipeline, end to end:

```
Step 1: Generate Circuits    →  Random circuits created via API
Step 2: Simulate Each One    →  Physics engine computes results
Step 3: Save as Training Data →  Each (circuit, results) pair = one training example
Step 4: Train the GNN Model  →  Model learns to predict results from circuit structure
Step 5: Export to ONNX       →  Convert model to a format the backend can load
Step 6: Deploy               →  Backend loads ONNX model, serves predictions in ~50ms
```

The goal: train a model that produces simulation results **10x faster** than the physics engine, so the app can give instant feedback while you're designing.

---

## Prerequisites

You need the backend API running (see [Getting Started](./getting-started.md)) **plus** the Python training environment:

```bash
cd artifacts/training-pipeline
python -m venv .venv
source .venv/bin/activate

pip install -r requirements.txt
```

This installs PyTorch, PyTorch Geometric (for graph neural networks), and FastAPI (for serving).

---

## Step 1: Generate Training Data

The data factory creates random circuits, sends them to the API for simulation, and saves the results.

```bash
cd artifacts/training-pipeline

python -m src.data_factory.circuit_generator \
  --api-url http://localhost:3000 \
  --num-examples 1000 \
  --output data/training.jsonl
```

**What this does:**
1. Picks a random topology template (linear chain, MZI, ring filter, etc. — there are 6 templates).
2. Randomizes component parameters within valid ranges.
3. POSTs the circuit to the API → the physics engine simulates it.
4. Saves the circuit definition + simulation results as one line of JSON.
5. Deletes the build from the database (cleanup).
6. Repeats 1,000 times (or however many you specified).

**Output:** A `.jsonl` file (JSON Lines) where each line is one training example:

```json
{
  "graph": {
    "components": [...],
    "connections": [...]
  },
  "results": {
    "equilibriumScore": 87.5,
    "systemLoss": 4.2,
    "snr": 35.1,
    "coherenceLength": 24.0,
    "converged": true,
    "componentResults": [...]
  },
  "topology": "mzi",
  "componentCount": 7,
  "source": "synthetic",
  "qualityScore": 0.92
}
```

### How Many Examples Do I Need?

| Dataset Size | Training Quality | Time to Generate |
|-------------|-----------------|-----------------|
| 1,000 | Good for testing the pipeline | ~10 minutes |
| 5,000 | Decent model accuracy | ~1 hour |
| 10,000–50,000 | Production-quality model | Several hours |
| 100,000+ | Best accuracy, diminishing returns | Overnight |

Start with 1,000 to make sure everything works, then scale up.

### The Six Topology Templates

The generator randomly picks from these circuit patterns to ensure diversity:

1. **Linear Chain** — Laser → 1–8 random components → Detector. The simplest pattern.
2. **MZI (Mach-Zehnder Interferometer)** — Laser → Splitter → two parallel arms → Combiner → Detector.
3. **Ring Filter** — Laser → Waveguide → Ring Resonator → Waveguide → Detector.
4. **Amplified Link** — Laser → Waveguide → Optical Amplifier → Waveguide → Detector.
5. **Multi-Stage Filter** — Laser → Filter → Isolator → Filter → Detector.
6. **Star Coupler** — Laser → Coupler → 2–4 Detectors.

Each template randomizes internal parameters (wavelengths, power levels, component counts) to create variety.

---

## Step 2: Train the Forward Surrogate Model

```bash
python -m src.training.train_surrogate \
  --data data/training.jsonl \
  --epochs 100 \
  --batch-size 32 \
  --save models/surrogate_v1.pt
```

**What this does:**
1. Loads the JSONL file and converts each example into a PyTorch Geometric graph.
2. Splits the data 90% training / 10% validation.
3. Trains a Graph Neural Network (GNN) for 100 epochs.
4. Saves the best model checkpoint (lowest validation loss).

### What the Model Looks Like

The model is called a **Forward Surrogate** because it approximates (acts as a surrogate for) the physics engine's forward simulation.

**Architecture:**
- **Input:** Circuit graph — nodes are components (29 features each), edges are connections (16 features each).
- **Encoder:** A 2-layer neural network that maps each node's 29 features into 128 internal features.
- **Message Passing (6 rounds):** Each node "talks" to its neighbors, sharing information about its state. After 6 rounds, every node knows about the entire circuit.
- **Node Predictions:** For each component, the model predicts: output power, SNR, phase, and status (ok/warning/error).
- **Global Predictions:** A set-transformer pools all node information into 4 circuit-wide predictions: equilibrium score, system loss, coherence length, and whether the circuit converged.

**Total parameters:** ~2 million (small enough to run in real-time).

### Training Output

You'll see output like this:

```
Epoch  1/100 | Train Loss: 2.451 | Val Loss: 2.203
Epoch  2/100 | Train Loss: 1.892 | Val Loss: 1.745
...
Epoch 87/100 | Train Loss: 0.124 | Val Loss: 0.131  ← Best checkpoint saved
...
Epoch 100/100 | Train Loss: 0.098 | Val Loss: 0.135
```

The validation loss should decrease steadily. If it starts increasing while training loss keeps dropping, the model is overfitting — you need more data or fewer epochs.

### Tuning Suggestions

| Problem | Try This |
|---------|----------|
| Loss isn't decreasing | Lower the learning rate: `--lr 0.0003` |
| Overfitting (val loss increasing) | Add more training data, or reduce epochs |
| Very slow training | Reduce batch size if running out of memory |
| Bad accuracy on complex circuits | Generate more complex topology examples |

---

## Step 3: Export to ONNX

ONNX (Open Neural Network Exchange) is a standard format that lets you run models outside of Python — in our case, inside the Node.js backend using ONNX Runtime.

```bash
python -m src.training.export_onnx \
  --checkpoint models/surrogate_v1.pt \
  --output models/surrogate_v1.onnx
```

**What this does:**
1. Loads the PyTorch checkpoint.
2. Creates a dummy input circuit graph.
3. Traces the model's computation graph.
4. Saves the model in ONNX format.

The resulting `.onnx` file is what the backend loads at startup.

---

## Step 4: Deploy the Model

Copy the ONNX file to where the backend can find it, then set the environment variable:

```bash
# Copy the model
cp models/surrogate_v1.onnx ../api-server/models/

# Update .env (or set the variable directly)
echo "ML_MODEL_PATH=./models/surrogate_v1.onnx" >> ../api-server/.env
echo "ML_MODEL_VERSION=1.0.0" >> ../api-server/.env

# Restart the backend
cd ../api-server
pnpm dev
```

You should see:
```
ML model loaded: ./models/surrogate_v1.onnx (v1.0.0)
Warm-up inference: 47ms
```

### Verifying the Model Works

1. Open the app at http://localhost:5173
2. Create a circuit with a few components.
3. In the editor, toggle **ML Mode** to "Instant."
4. Changes should now produce instant predictions (instead of waiting for the physics engine).

You can also check the model status via the API:
```bash
curl http://localhost:3000/api/predict/status
# → {"loaded": true, "version": "1.0.0", "latency_ms": 47}
```

---

## Step 5: Evaluate Model Quality

The evaluation module computes how well the model's predictions match the physics engine:

```bash
python -m src.evaluation.metrics \
  --model models/surrogate_v1.pt \
  --data data/training.jsonl \
  --split val
```

**Key metrics:**
- **Power MAE** — Average error in predicted output power (dBm). Target: < 1.0 dBm.
- **Phase MAE** — Average error in predicted phase (radians). Target: < 0.1 rad.
- **Status Accuracy** — How often the model correctly predicts ok/warning/error. Target: > 90%.
- **Equilibrium Score MAE** — Average error in the 0–100 score. Target: < 5 points.
- **Convergence Precision/Recall** — How well it predicts whether a circuit converged.

---

## Understanding the Data Flow

Here's how a circuit becomes ML-ready, step by step:

### From Canvas to Training Example

```
Canvas (visual)
    ↓
Components + Connections (JSON)
    ↓
POST /api/builds/:id/simulate
    ↓
Physics Engine processes the circuit
    ↓
Simulation Results (JSON)
    ↓
{ graph + results } = one training example (JSONL line)
```

### From Training Example to Model Input

```
Training Example (JSONL)
    ↓
Graph Encoder (lib/ml-models/src/graphEncoder.ts)
    ↓
Node Features: [N, 29] tensor   ← N components, 29 features each
Edge Index:    [2, E] tensor     ← E connections, source→target pairs
Edge Features: [E, 16] tensor   ← E connections, 16 features each
    ↓
GNN Forward Pass
    ↓
Node Predictions: [N, 6]        ← power, snr, phase, status (3 logits)
Global Predictions: [1, 4]      ← eq_score, loss, coherence, converged
```

---

## Advanced: Active Learning (Experimental)

The `src/active_learning/` directory contains tools for intelligently expanding the dataset:

- **Quality Gates** — Filter out low-confidence or degenerate examples (e.g., circuits that are obviously broken).
- **Collector** — Progressively add more examples in areas where the model is uncertain.
- **Uncertainty Sampling** — Focus data generation on circuit types the model struggles with.

This is still under development. For now, the random data generator produces good enough diversity for most use cases.

---

## Advanced: Generative Model (Inverse Design)

The `src/models/generative_cvae.py` defines a **Conditional Variational Autoencoder** that generates new circuit designs from target specifications:

**Input:** "I want a circuit with wavelength 1550nm, output power 5 dBm, SNR > 30 dB, using at most 10 components."

**Output:** One or more candidate circuit designs that meet those specs.

This model is not yet integrated into the frontend, but the architecture is in place. Training it requires the same JSONL data plus the generative model training script.

---

## Quick Command Reference

```bash
# Generate 5000 training examples
python -m src.data_factory.circuit_generator \
  --api-url http://localhost:3000 \
  --num-examples 5000 \
  --output data/training.jsonl

# Train for 100 epochs
python -m src.training.train_surrogate \
  --data data/training.jsonl \
  --epochs 100 \
  --batch-size 32 \
  --save models/surrogate_v1.pt

# Export to ONNX
python -m src.training.export_onnx \
  --checkpoint models/surrogate_v1.pt \
  --output models/surrogate_v1.onnx

# Evaluate
python -m src.evaluation.metrics \
  --model models/surrogate_v1.pt \
  --data data/training.jsonl \
  --split val

# Serve via Python (alternative to Node.js ONNX Runtime)
python -m src.serve.app \
  --model models/surrogate_v1.pt \
  --port 8000
```

---

## Next Steps

- **New to the project?** → [Getting Started](./getting-started.md)
- **Want to understand circuit design?** → [Circuit Guide](./circuit-guide.md)
- **Want to understand the codebase?** → [Architecture Overview](./architecture-overview.md)
