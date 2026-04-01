# Photonics-Equilibrium

**A tool for designing photonic circuits and training machine learning models to predict how those circuits behave.**

## What Is This Project?

Photonics-Equilibrium lets you:

1. **Design photonic circuits** — drag-and-drop optical components (lasers, waveguides, detectors, etc.) and wire them together on a visual canvas.
2. **Simulate circuits** — a built-in physics engine calculates how light flows through your circuit: power levels, signal-to-noise ratio, losses, and whether the circuit is working correctly.
3. **Generate training data** — run thousands of random circuits through the simulator automatically, producing labeled datasets.
4. **Train ML models** — use those datasets to train a graph neural network (GNN) that can predict simulation results ~10x faster than the physics engine.
5. **Use ML predictions in real-time** — the trained model runs inside the app, giving instant feedback as you design.

## Who Is This For?

Anyone who wants to help build circuits or improve the ML pipeline. You do **not** need a photonics background — the docs explain every component in plain language.

## Documentation

Start here, in order:

| Doc | What It Covers |
|-----|---------------|
| [Getting Started](./getting-started.md) | Install everything and run the app locally |
| [Circuit Guide](./circuit-guide.md) | How circuits work and how to build them |
| [Component Reference](./component-reference.md) | Every optical component explained simply |
| [ML Training Guide](./ml-training-guide.md) | How to generate data and train models |
| [Architecture Overview](./architecture-overview.md) | How the codebase is organized |

## Quick Start (5 minutes)

```bash
# 1. Clone and install
git clone <repo-url>
cd Photonics-Equilibrium
pnpm install

# 2. Set up the database
# (Requires a running PostgreSQL instance)
cp .env.example .env   # Edit with your DATABASE_URL
pnpm --filter @workspace/db run push

# 3. Start the backend
cd artifacts/api-server
PORT=3000 pnpm dev

# 4. Start the frontend (new terminal)
cd artifacts/photonics-sim
pnpm dev
# Open http://localhost:5173
```

## Project Structure (simplified)

```
Photonics-Equilibrium/
├── artifacts/
│   ├── photonics-sim/        ← Frontend (React app you see in the browser)
│   ├── api-server/           ← Backend (REST API + physics engine)
│   └── training-pipeline/    ← Python ML training code
├── lib/
│   ├── db/                   ← Database schema (PostgreSQL + Drizzle)
│   ├── ml-models/            ← Shared ML encoding/decoding (TypeScript)
│   ├── api-spec/             ← OpenAPI specification
│   ├── api-client-react/     ← Auto-generated React hooks
│   └── api-zod/              ← Auto-generated validation schemas
├── docs/                     ← You are here
└── scripts/                  ← Utility scripts
```

## Key Concepts in 30 Seconds

- **Circuit** = a collection of optical components wired together.
- **Simulation** = the physics engine calculating what happens when light passes through the circuit.
- **Equilibrium Score** = a 0–100 health score for a circuit. 85+ means the circuit is working well.
- **Training Example** = one circuit + its simulation results, saved as a line of JSON.
- **Forward Surrogate Model** = the ML model that predicts simulation results without running the physics engine.
