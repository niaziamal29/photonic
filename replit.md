# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   └── photonics-sim/      # React + Vite Photonics Engine Simulator (served at /)
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts
├── pnpm-workspace.yaml     # pnpm workspace
├── tsconfig.base.json      # Shared TS options
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## Photonics Engine Simulator

A full-stack web application for scientists to design, simulate, and iterate on photonic circuits.

### Features
- **Circuit Builder**: Visual drag-and-drop canvas using React Flow (`@xyflow/react`) to place and connect optical components
- **Component Library**: 15 optical component types (laser sources, waveguides, beam splitters, modulators, detectors, amplifiers, etc.)
- **Physics Simulation Engine**: Backend engine computing real physics (power in dBm, phase, loss, SNR, coherence length, wavelength)
- **Diagnostics Panel**: Color-coded issues (errors/warnings/info) with specific fix suggestions per component
- **Equilibrium Score**: 0-100 score tracking how close the circuit is to equilibrium/harmony
- **Iteration Tracking**: History of simulation runs tracking convergence progress
- **Properties Panel**: Per-component parameter editing with sliders and number inputs

### Frontend (`artifacts/photonics-sim`)
- React + Vite, Tailwind CSS, shadcn/ui components
- Dark mode scientific/technical aesthetic (cyan + deep navy)
- React Flow for circuit diagram visualization
- Zustand for global state management
- Recharts for iteration history charts (planned)
- `@workspace/api-client-react` for generated React Query hooks

### Backend (`artifacts/api-server`)
- Express 5 routes:
  - `GET /api/components` — Component library (15 types)
  - `GET/POST /api/builds` — Build management
  - `GET/PUT/DELETE /api/builds/:id` — Single build operations
  - `POST /api/builds/:id/simulate` — Run photonics simulation
  - `GET /api/builds/:id/simulations` — Simulation history
- Physics simulation engine: `artifacts/api-server/src/lib/photonicsEngine.ts`

### Database (`lib/db`)
- `builds` table — Circuit configurations with layout (JSONB), status, equilibrium score
- `simulations` table — Simulation results history with component results (JSONB)

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`).
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API client and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push database schema changes

## Packages

### `artifacts/api-server` (`@workspace/api-server`)
Express 5 API server with Pino structured logging.
- Routes: `src/routes/health.ts`, `src/routes/builds.ts`, `src/routes/components.ts`
- Physics engine: `src/lib/photonicsEngine.ts`

### `artifacts/photonics-sim` (`@workspace/photonics-sim`)
React + Vite frontend app served at `/`.
- Pages: `src/pages/dashboard.tsx`, `src/pages/editor.tsx`
- Panels: `ComponentLibrary`, `PropertiesPanel`, `DiagnosticsPanel`, `SimulationPanel`
- Canvas: `CircuitCanvas` (React Flow), `PhotonNode` (custom node component)
- State: `src/store/use-simulator-store.ts` (Zustand)

### `lib/db` (`@workspace/db`)
Database layer using Drizzle ORM with PostgreSQL.
- Schema: `src/schema/photonics.ts` — `buildsTable`, `simulationsTable`
- Run migrations: `pnpm --filter @workspace/db run push`
