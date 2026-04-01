# Photonics-Equilibrium — Product Roadmap

**Last Updated:** 2026-03-26
**Format:** Now / Next / Later
**Status:** Living document — reviewed monthly

---

## Product Vision

Photonics-Equilibrium is an **ML-accelerated photonic circuit design platform** that enables photonics engineers to design, simulate, and optimize integrated photonic circuits 10–100x faster than traditional EDA tools.

The core thesis: photonic circuit simulation is computationally expensive and iteratively slow. By training graph neural networks on the output of a corrected physics engine, we can provide **real-time design feedback** (sub-5ms predictions) while the engineer works — replacing the "design → wait → review → redesign" cycle with a **live, interactive design surface**. The generative model (inverse design) goes further: given target specifications, the system proposes novel circuit topologies that meet those specs.

**Target users:** Photonic IC designers, silicon photonics engineers, telecom system architects, photonics research groups, and EDA tool companies seeking to integrate ML-accelerated simulation.

---

## Application Goal

Build the industry's first **accessible, ML-native photonic circuit design tool** that:

1. **Democratizes photonic design** — intuitive drag-and-drop canvas with plain-language component documentation, removing the steep learning curve of legacy EDA tools (Lumerical, Synopsys RSoft, Ansys Photon Design Suite)
2. **Delivers real-time simulation** — GNN forward surrogate provides instant per-node power/SNR/phase predictions as the user edits, with physics engine verification on demand
3. **Enables inverse design** — "I need 30 dB SNR at 1550nm with ≤10 components" → system generates candidate circuits that meet the spec
4. **Generates a proprietary training data flywheel** — every user simulation enriches the model, improving prediction accuracy for all users over time

---

## Monetization Strategy for Service Providers

The platform monetizes through a **tiered SaaS model** targeting photonics service providers (foundries, design houses, consultancies) and engineering teams.

### Tier 1: Free / Community
- Full circuit editor with drag-and-drop canvas
- Physics engine simulation (synchronous, queued)
- Up to 50 saved builds
- Community component library (15 standard components)
- Public training data contribution (opt-in)

**Purpose:** Adoption flywheel. Every free user generates simulation data that improves the ML models. The free tier is the data acquisition engine.

### Tier 2: Pro ($49/seat/month)
- Everything in Free
- **ML-accelerated real-time predictions** (sub-5ms, unlimited)
- Unlimited saved builds
- Simulation history and comparison tools
- Export circuits as JSON/GDSII/Lumerical-compatible formats
- Priority physics engine queue
- API access (100 predictions/day)

**Purpose:** Individual engineers and small teams who need speed. The real-time prediction is the core differentiator — it's the feature users can't get from Lumerical or RSoft.

### Tier 3: Team ($199/seat/month, min 5 seats)
- Everything in Pro
- **Inverse design engine** — generate circuit topologies from target specs
- Custom component library (define proprietary component types with custom physics)
- Team collaboration: shared builds, annotations, design reviews
- Unlimited API access
- SSO/SAML authentication
- Audit logging

**Purpose:** Design houses and foundry teams. Custom components are the lock-in — once a foundry defines their PDK components in the system, switching costs are high.

### Tier 4: Enterprise (Custom pricing)
- Everything in Team
- **On-premise / VPC deployment** (critical for IP-sensitive foundries)
- Custom ML model training on proprietary circuit data
- Integration with existing EDA toolchains (Cadence, Synopsys, Mentor)
- Dedicated support and SLA
- White-label option for foundries offering design tools to their customers

**Purpose:** Foundries (TSMC, GlobalFoundries, Tower Semiconductor) and large design houses. On-prem deployment and custom models are table stakes for enterprise photonics.

### Additional Revenue Streams

**Simulation Credits:** Pay-per-use physics engine runs for free-tier users who exceed quotas. $0.01 per simulation.

**Marketplace:** Third-party component libraries (e.g., a foundry publishes their PDK as a paid component pack). Platform takes 20% commission.

**Training Data Licensing:** Aggregated, anonymized circuit-performance datasets sold to academic institutions and ML researchers. This is a unique asset — no public dataset of this scale exists for photonic circuit simulation.

**API-as-a-Service:** Standalone ML prediction API for integration into third-party EDA tools. Priced per-prediction ($0.001/call) or flat monthly rate.

---

## Current State (as of 2026-03-26)

### Status Overview

| Area | Status | Completion |
|------|--------|------------|
| Frontend (React + ReactFlow) | **Done** | 95% |
| Backend API (Express 5) | **Done** | 90% |
| Physics Engine | **Done** | 95% — 26+ tests passing |
| Database Schema (Drizzle + Postgres) | **Done** | 100% |
| OpenAPI Spec + Codegen | **Done** | 100% |
| ML Port Specification | **Done** | 100% — 55 tests passing |
| ML Inference Runtime (ONNX) | **Done** | 80% — framework complete, no model |
| Training Pipeline (Python) | **Done** | 85% — code complete, not executed |
| GNN Model Architecture | **Done** | 90% — defined, not trained |
| cVAE Generative Model | **Done** | 60% — template code, not trained |
| Documentation | **Done** | 90% |
| Authentication / Multi-tenant | **Not Started** | 0% |
| Billing / Subscriptions | **Not Started** | 0% |
| Deployment / DevOps | **Not Started** | 0% |

### Key Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| No trained ML model exists yet | **Critical** | Training pipeline code is complete — need GPU compute to execute |
| ONNX export of PyG scatter ops | **High** | Plan includes rewrite strategy; budget 2–3 days for this |
| cVAE mode collapse | **Medium** | Fallback to DiGress-style diffusion at Stage 1.5 |
| No authentication layer | **High** | Blocks all monetization — must be added before any paid tier |
| Single-tenant architecture | **High** | No tenant isolation, no usage tracking, no billing hooks |

---

## Roadmap

### NOW (Current Sprint — Weeks 1–4)

These are committed, in-flight or immediately next. High confidence in scope and timeline.

| # | Initiative | Owner | Status | Dependencies |
|---|-----------|-------|--------|--------------|
| 1 | **Generate synthetic training data (500K circuits)** | — | Not Started | Requires GPU or CPU farm; physics engine is ready |
| 2 | **Train GNN forward surrogate v1** | — | Not Started | Depends on #1; target MAE < 1dB, R² > 0.95 |
| 3 | **ONNX export + scatter op rewrite** | — | Not Started | Depends on #2; budget 2–3 days for PyG compatibility |
| 4 | **Deploy trained model into ONNX Runtime inference path** | — | Not Started | Depends on #3; framework code exists, need .onnx file |
| 5 | **End-to-end ML prediction flow verification** | — | Not Started | Depends on #4; user edits canvas → sees live ML predictions |
| 6 | **Frontend test coverage** | — | Not Started | No blockers; React Testing Library + Vitest |
| 7 | **API integration tests (supertest)** | — | Not Started | No blockers; supertest already in devDeps |

**Exit criteria:** A user can open the app, design a circuit on the canvas, and see real-time ML-predicted power/SNR/phase overlays updating as they edit. Physics engine remains available as verification fallback.

---

### NEXT (Weeks 5–12)

Planned work. Good confidence in what, less confidence in exactly when.

| # | Initiative | Priority | Est. Effort | Dependencies |
|---|-----------|----------|-------------|--------------|
| 8 | **Authentication + user accounts** | P0 | 2 weeks | None — use Clerk or Auth.js; add to Express middleware |
| 9 | **Multi-tenant data isolation** | P0 | 1 week | Depends on #8; row-level security or tenant_id FK on all tables |
| 10 | **Usage tracking + metering** | P0 | 1 week | Depends on #9; track predictions/day, simulations, storage |
| 11 | **Stripe billing integration** | P0 | 2 weeks | Depends on #10; implement Free/Pro/Team tiers |
| 12 | **Train cVAE generative model v1** | P1 | 2 weeks | Depends on #1 (training data); FastAPI sidecar code exists |
| 13 | **Inverse design panel — full implementation** | P1 | 1 week | Depends on #12; frontend stub exists |
| 14 | **Circuit export (JSON, GDSII preview)** | P1 | 1 week | No blockers |
| 15 | **Dockerize full stack** | P1 | 1 week | Docker Compose: Postgres + API + Frontend + Python sidecar |
| 16 | **CI/CD pipeline (GitHub Actions)** | P1 | 3 days | Depends on #15; lint → test → build → deploy |
| 17 | **Scale training data to 1M circuits + retrain** | P2 | 2 weeks | Depends on #2 (v1 model); target MAE < 0.5dB, R² > 0.98 |

**Theme:** Transform from engineering prototype to deployable commercial product. Auth + billing are the critical path — nothing else in the monetization strategy works without them.

---

### LATER (Weeks 13–26)

Directional. Strategic bets we intend to pursue, but scope and timing are flexible.

| # | Initiative | Priority | Notes |
|---|-----------|----------|-------|
| 18 | **DiGress-style discrete diffusion (replace cVAE)** | P1 | Better diversity, less mode collapse; independent of Stage 2 |
| 19 | **Custom component library (user-defined components)** | P1 | Key lock-in for Team/Enterprise tiers; PDK integration |
| 20 | **Team collaboration features** | P2 | Shared builds, comments, design review workflows |
| 21 | **WebSocket real-time prediction streaming** | P2 | Server-push for generative model streaming; REST is fine for forward surrogate |
| 22 | **On-premise deployment package** | P2 | Helm chart or similar; required for Enterprise tier |
| 23 | **Active learning pipeline** | P2 | Smart data collection based on model uncertainty; framework code exists |
| 24 | **EDA tool integrations (Lumerical, Cadence)** | P3 | Import/export compatibility; Enterprise feature |
| 25 | **Component marketplace** | P3 | Third-party foundry PDK publishing; 20% commission model |
| 26 | **Training data licensing program** | P3 | Anonymized dataset sales to academia/research |
| 27 | **Stage 2: Device-level physics (FDTD)** | P3 | Electromagnetic field modeling within components; fundamentally different axis |

---

## Dependencies Map

```
Training Data (#1)
  ├── GNN Training (#2) ── ONNX Export (#3) ── Deploy Model (#4) ── E2E Verification (#5)
  ├── cVAE Training (#12) ── Inverse Design UI (#13)
  └── Scale to 1M (#17)

Authentication (#8)
  └── Multi-tenant (#9) ── Usage Tracking (#10) ── Stripe Billing (#11)

Dockerize (#15) ── CI/CD (#16) ── On-Prem (#22)
```

**Critical path to first revenue:** #1 → #2 → #3 → #4 → #5 (ML working) + #8 → #9 → #10 → #11 (billing working) → **Launch Pro tier**

Estimated time to first revenue: **12–16 weeks** from today, assuming one full-time engineer + GPU access for training.

---

## Capacity Notes

- The codebase is approximately **95% built** for a single-user local deployment. The remaining 5% is executing the ML training pipeline.
- The **entire monetization layer** (auth, billing, multi-tenancy, usage tracking) is 0% built. This is the largest gap between current state and commercial viability.
- The training pipeline Python code is complete and tested but has never been executed against real data. First training run will likely surface integration issues.
- Frontend and backend are production-quality for a single tenant. Multi-tenant isolation requires schema changes (tenant_id columns) and middleware additions.

---

## Success Metrics

| Metric | Target (Month 3) | Target (Month 6) |
|--------|------------------|------------------|
| Free tier signups | 500 | 2,000 |
| Pro conversions | 20 (4%) | 100 (5%) |
| Team accounts | 2 | 10 |
| ML prediction accuracy (MAE) | < 1 dB | < 0.5 dB |
| Prediction latency (p95) | < 10ms | < 5ms |
| Training examples in flywheel | 500K | 2M |
| Monthly recurring revenue | $1K | $15K |

---

## Competitive Landscape

| Competitor | Strength | Our Differentiation |
|-----------|----------|-------------------|
| Lumerical (Ansys) | Industry standard FDTD | Real-time ML predictions; 1000x faster feedback loop |
| Synopsys RSoft | Mature beam propagation | Accessible UI; no $50K+ license; inverse design |
| Photon Design (PhoeniX) | Comprehensive PIC design | ML-native architecture; generative circuit design |
| Tidy3D (Flexcompute) | Cloud-accelerated FDTD | Circuit-level (not device-level); instant predictions |
| Luceda IPKISS | Python scripting for PIC | Visual editor; no programming required |

**Our wedge:** None of these tools offer real-time ML-predicted simulation feedback during design. The "design while you get instant results" experience is the primary differentiator. Inverse design (generating circuits from specs) is the secondary differentiator — no commercial tool offers this today.

---

## Changes Log

| Date | Change | Reason |
|------|--------|--------|
| 2026-03-26 | Initial roadmap created | Synthesized from 5 planning documents, system design review, and full codebase audit |
