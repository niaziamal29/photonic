# Getting Started

This guide walks you through setting up Photonics-Equilibrium on your machine so you can design circuits, run simulations, and generate ML training data.

## What You Need

| Tool | Version | What It's For |
|------|---------|--------------|
| **Node.js** | 18+ | Runs the backend server and builds the frontend |
| **pnpm** | 8+ | Installs JavaScript packages (like npm, but faster) |
| **PostgreSQL** | 14+ | Stores circuits, simulation results, and ML models |
| **Python** | 3.10+ | Runs the ML training pipeline |
| **Git** | Any | Cloning the repository |

### Installing the Prerequisites

**Node.js & pnpm:**
```bash
# Install Node.js (https://nodejs.org)
# Then install pnpm:
npm install -g pnpm
```

**PostgreSQL:**
```bash
# macOS (Homebrew)
brew install postgresql@16 && brew services start postgresql@16

# Ubuntu/Debian
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql

# Or use Docker:
docker run -d --name photonics-db -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16
```

**Python (for ML training only — skip if you only want to design circuits):**
```bash
# Create a virtual environment
cd artifacts/training-pipeline
python -m venv .venv
source .venv/bin/activate   # Linux/macOS
# .venv\Scripts\activate    # Windows

pip install -r requirements.txt
```

---

## Step-by-Step Setup

### 1. Clone the Repository

```bash
git clone <repo-url>
cd Photonics-Equilibrium
```

### 2. Install JavaScript Dependencies

```bash
pnpm install
```

This installs packages for the frontend, backend, and all shared libraries at once (it's a monorepo).

### 3. Create the Database

```bash
# Connect to PostgreSQL and create a database
psql -U postgres -c "CREATE DATABASE photonics;"
```

### 4. Configure Environment Variables

Create a `.env` file in the project root (or in `artifacts/api-server/`):

```env
PORT=3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/photonics
ALLOWED_ORIGINS=http://localhost:5173
```

Optional ML settings (only needed if you have a trained model):
```env
ML_MODEL_PATH=./models/surrogate_v1.onnx
ML_MODEL_VERSION=1.0.0
```

### 5. Push the Database Schema

```bash
pnpm --filter @workspace/db run push
```

This creates all the tables the app needs (builds, simulations, training examples, ML models).

### 6. Start the Backend

```bash
cd artifacts/api-server
pnpm dev
```

You should see something like:
```
Server listening on port 3000
ML model: not loaded (no ML_MODEL_PATH set)
```

### 7. Start the Frontend

Open a **new terminal**:

```bash
cd artifacts/photonics-sim
pnpm dev
```

You should see:
```
VITE v6.x.x ready in xxx ms
➜ Local: http://localhost:5173/
```

### 8. Open the App

Go to **http://localhost:5173** in your browser. You should see the dashboard. Click "New Build" to start designing a circuit.

---

## Verifying Everything Works

1. **Create a build** — Click "New Build" on the dashboard, give it a name.
2. **Add components** — Drag a Laser Source and a Photodetector from the left panel onto the canvas.
3. **Connect them** — Draw a wire from the laser's output port to the detector's input port.
4. **Run a simulation** — Click "Simulate" in the bottom panel.
5. **Check results** — You should see an equilibrium score, power readings, and any issues.

If all five steps work, you're set up.

---

## Common Problems

**"Cannot connect to database"**
- Make sure PostgreSQL is running: `pg_isready`
- Check that `DATABASE_URL` in your `.env` matches your PostgreSQL setup.

**"Port 3000 already in use"**
- Another process is using that port. Either stop it (`lsof -i :3000`) or change `PORT` in your `.env`.

**"Module not found" errors on `pnpm dev`**
- Run `pnpm install` again from the project root.

**Frontend shows a blank page or network errors**
- Make sure the backend is running on port 3000 first.
- Check that `ALLOWED_ORIGINS` includes `http://localhost:5173`.

---

## What's Next?

- **Want to design circuits?** → Read the [Circuit Guide](./circuit-guide.md)
- **Want to generate training data?** → Read the [ML Training Guide](./ml-training-guide.md)
- **Want to understand the codebase?** → Read the [Architecture Overview](./architecture-overview.md)
