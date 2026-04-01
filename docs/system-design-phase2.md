# Photonics Equilibrium — Phase 2 System Design
## Commercial Infrastructure: Auth, Billing, Multi-Tenancy, Real-Time Prediction, Deployment

**Date:** 2026-03-27
**Author:** AXIOM
**Status:** Design Document
**Scope:** Everything between "working prototype" and "revenue-generating SaaS"

---

## 1. Executive Summary

The Photonics-Equilibrium platform has a 95% complete single-tenant prototype. This document designs the infrastructure layer required to transform it into a commercially viable multi-tenant SaaS product. It covers five systems: authentication, multi-tenancy, billing/metering, real-time prediction delivery, and deployment infrastructure.

**Design principles for this phase:**
- **Minimize custom code** — use managed services (Clerk, Stripe, Vercel/Railway) where the economics make sense at current scale
- **Schema-first multi-tenancy** — tenant isolation via `tenant_id` foreign keys with row-level filtering, not separate databases (premature at this stage)
- **Metering before billing** — instrument everything first, then connect to Stripe; decouples usage tracking from payment provider
- **Progressive complexity** — ship Free + Pro tiers first, add Team/Enterprise features incrementally

**Critical path:** Auth middleware → tenant_id migration → usage metering → Stripe integration → Pro tier launch. Target: 8 weeks.

---

## 2. Authentication & Authorization

### 2.1 Decision: Clerk over Auth.js

| Factor | Clerk | Auth.js (NextAuth) |
|--------|-------|--------------------|
| Time to integrate | 1–2 days | 3–5 days |
| SSO/SAML (Team tier) | Built-in (paid plan) | Manual integration |
| Session management | Managed, JWT-based | Self-managed |
| MFA | Built-in | Plugin required |
| Express middleware | `@clerk/express` | Custom adapter needed |
| React components | `@clerk/clerk-react` | Manual UI |
| Cost at scale | $0.02/MAU after 10K | Free (self-hosted) |
| Org/team support | Native | Manual |

**Verdict:** Clerk. The Express + React SDK support maps directly to our stack. Native organization support directly enables Team tier features. The cost ($0.02/MAU) is negligible against $49/seat/month revenue. Auth.js would save money but cost 2+ weeks of engineering time on SSO, org management, and session handling.

### 2.2 Auth Architecture

```
┌──────────────────────────────────────────────────────────┐
│                     Frontend (React)                      │
│                                                          │
│  <ClerkProvider>                                         │
│    ├── <SignIn /> / <SignUp />  (Clerk hosted components) │
│    ├── <OrganizationSwitcher />  (Team tier)             │
│    └── useAuth() → JWT token in Authorization header     │
│                                                          │
│  React Query hooks auto-attach Bearer token via          │
│  Axios interceptor in api-client-react                   │
└────────────────────┬─────────────────────────────────────┘
                     │ Authorization: Bearer <jwt>
                     ▼
┌──────────────────────────────────────────────────────────┐
│                   Backend (Express 5)                     │
│                                                          │
│  middleware/auth.ts                                       │
│    ├── clerkMiddleware()  — validates JWT, sets req.auth │
│    ├── requireAuth()      — 401 if no valid session      │
│    └── requireOrg()       — 403 if not in an org (Team)  │
│                                                          │
│  middleware/tenant.ts                                     │
│    ├── extractTenant()    — userId or orgId from JWT      │
│    └── injectTenantScope() — adds .where(eq(tenantId))   │
│                                                          │
│  Routes: all queries scoped to req.tenant                │
└──────────────────────────────────────────────────────────┘
```

### 2.3 Auth Middleware Implementation

```typescript
// artifacts/api-server/src/middleware/auth.ts
import { clerkMiddleware, requireAuth } from '@clerk/express';

// Apply to all routes — populates req.auth (nullable)
export const authMiddleware = clerkMiddleware();

// Gate for authenticated routes
export const authenticated = requireAuth();

// Gate for org-scoped routes (Team tier)
export function requireOrg(req, res, next) {
  if (!req.auth?.orgId) {
    return res.status(403).json({
      error: 'Organization membership required for this feature'
    });
  }
  next();
}
```

### 2.4 Role Model

| Role | Scope | Permissions |
|------|-------|-------------|
| `user` | Personal | CRUD own builds, run simulations, ML predictions |
| `org:member` | Organization | Read shared builds, run simulations |
| `org:admin` | Organization | CRUD all org builds, manage members, view usage |
| `org:owner` | Organization | Billing, delete org, transfer ownership |

Roles are managed by Clerk's organization membership system. No custom RBAC needed at launch.

---

## 3. Multi-Tenancy

### 3.1 Strategy: Shared Schema, Row-Level Isolation

At current scale (targeting 500 users in 3 months), separate databases per tenant is overkill. Row-level isolation via `tenant_id` column is the right trade-off: simple, fast to implement, and sufficient until we hit 10K+ tenants.

### 3.2 Schema Migration

Every user-facing table gains a `tenant_id` column. For personal accounts, `tenant_id = clerk_user_id`. For org accounts, `tenant_id = clerk_org_id`. This means a user's personal builds are separate from their org builds.

```typescript
// lib/db/src/schema/photonics.ts — additions

// New: Tenant reference on all user-facing tables
export const buildsTable = pgTable('builds', {
  id: serial('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),        // ← NEW
  createdBy: text('created_by').notNull(),       // ← NEW (clerk user_id)
  name: text('name').notNull(),
  // ... existing columns unchanged ...
}, (table) => ({
  tenantIdx: index('builds_tenant_idx').on(table.tenantId),
  tenantCreatedIdx: index('builds_tenant_created_idx')
    .on(table.tenantId, table.createdAt),
}));

export const simulationsTable = pgTable('simulations', {
  id: serial('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),         // ← NEW
  buildId: integer('build_id').notNull(),
  // ... existing columns unchanged ...
}, (table) => ({
  tenantIdx: index('sims_tenant_idx').on(table.tenantId),
  buildIdx: index('sims_build_idx').on(table.buildId),  // ← was missing
}));

// New: Usage tracking table
export const usageEventsTable = pgTable('usage_events', {
  id: serial('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  userId: text('user_id').notNull(),
  eventType: text('event_type').notNull(),       // 'simulation' | 'prediction' | 'build_created'
  metadata: jsonb('metadata'),                    // { circuitSize, latencyMs, modelVersion }
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  tenantEventIdx: index('usage_tenant_event_idx')
    .on(table.tenantId, table.eventType, table.createdAt),
}));

// New: Subscription state (synced from Stripe webhooks)
export const subscriptionsTable = pgTable('subscriptions', {
  id: serial('id').primaryKey(),
  tenantId: text('tenant_id').notNull().unique(),
  stripeCustomerId: text('stripe_customer_id').notNull(),
  stripeSubscriptionId: text('stripe_subscription_id'),
  plan: text('plan').notNull().default('free'),  // 'free' | 'pro' | 'team' | 'enterprise'
  status: text('status').notNull().default('active'), // 'active' | 'past_due' | 'canceled'
  currentPeriodStart: timestamp('current_period_start'),
  currentPeriodEnd: timestamp('current_period_end'),
  seats: integer('seats').default(1),
  updatedAt: timestamp('updated_at').defaultNow(),
});
```

### 3.3 Tenant Scoping Middleware

```typescript
// artifacts/api-server/src/middleware/tenant.ts
import { eq } from 'drizzle-orm';

export function tenantScope(req, res, next) {
  const auth = req.auth;
  if (!auth?.userId) return res.status(401).json({ error: 'Unauthorized' });

  // Org context takes precedence (Team tier)
  req.tenantId = auth.orgId || auth.userId;
  req.userId = auth.userId;
  next();
}

// Helper: add tenant filter to any query
export function withTenant(query, table, tenantId) {
  return query.where(eq(table.tenantId, tenantId));
}
```

### 3.4 Migration Strategy

1. Add `tenant_id` column as nullable
2. Backfill existing rows with a default tenant ID (the dev user)
3. Make `tenant_id` NOT NULL
4. Add indexes
5. Update all route handlers to use `withTenant()`

Zero downtime. Estimated effort: 1 day for schema, 2 days for route updates.

---

## 4. Billing & Usage Metering

### 4.1 Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    Usage Events                      │
│                                                      │
│  API Routes emit events:                             │
│    simulate() → emit('simulation', { tenantId })     │
│    predict()  → emit('prediction', { tenantId })     │
│    create()   → emit('build_created', { tenantId })  │
│                                                      │
│  UsageMeter service:                                 │
│    ├── Writes to usage_events table (PostgreSQL)     │
│    ├── Maintains in-memory counters (per-tenant)     │
│    └── Checks limits before allowing operations      │
└─────────────────────┬───────────────────────────────┘
                      │ Periodic sync (hourly)
                      ▼
┌─────────────────────────────────────────────────────┐
│               Stripe Billing                         │
│                                                      │
│  Stripe Products:                                    │
│    ├── pe_free      → $0/mo, 50 builds, 10 sims/day │
│    ├── pe_pro       → $49/seat/mo, unlimited          │
│    └── pe_team      → $199/seat/mo, min 5 seats       │
│                                                      │
│  Stripe Metered Billing (overage):                   │
│    └── pe_sim_credit → $0.01/simulation (free tier)  │
│                                                      │
│  Webhooks → /api/webhooks/stripe                     │
│    ├── checkout.session.completed → activate sub      │
│    ├── invoice.paid → extend period                   │
│    ├── invoice.payment_failed → mark past_due        │
│    └── customer.subscription.deleted → downgrade     │
└─────────────────────────────────────────────────────┘
```

### 4.2 Plan Limits

| Resource | Free | Pro ($49) | Team ($199) |
|----------|------|-----------|-------------|
| Saved builds | 50 | Unlimited | Unlimited |
| Physics simulations/day | 10 | Unlimited | Unlimited |
| ML predictions/day | 0 | Unlimited | Unlimited |
| API access | No | 100 calls/day | Unlimited |
| Circuit export | No | Yes | Yes |
| Inverse design | No | No | Yes |
| Custom components | No | No | Yes |
| SSO/SAML | No | No | Yes |
| Seats | 1 | 1 | 5–100 |

### 4.3 Usage Metering Service

```typescript
// artifacts/api-server/src/services/usage-meter.ts
import { db } from '@workspace/db';
import { usageEventsTable, subscriptionsTable } from '@workspace/db/schema';
import { eq, and, gte, sql } from 'drizzle-orm';

interface PlanLimits {
  maxBuilds: number;
  maxSimsPerDay: number;
  maxPredictionsPerDay: number;
  maxApiCallsPerDay: number;
  features: Set<string>;
}

const PLAN_LIMITS: Record<string, PlanLimits> = {
  free: {
    maxBuilds: 50,
    maxSimsPerDay: 10,
    maxPredictionsPerDay: 0,
    maxApiCallsPerDay: 0,
    features: new Set(),
  },
  pro: {
    maxBuilds: Infinity,
    maxSimsPerDay: Infinity,
    maxPredictionsPerDay: Infinity,
    maxApiCallsPerDay: 100,
    features: new Set(['ml_predictions', 'export', 'priority_queue']),
  },
  team: {
    maxBuilds: Infinity,
    maxSimsPerDay: Infinity,
    maxPredictionsPerDay: Infinity,
    maxApiCallsPerDay: Infinity,
    features: new Set(['ml_predictions', 'export', 'inverse_design',
                       'custom_components', 'sso', 'priority_queue']),
  },
};

export class UsageMeter {
  // Check if tenant can perform action
  async canPerform(tenantId: string, action: string): Promise<{
    allowed: boolean;
    reason?: string;
    remaining?: number;
  }> {
    const sub = await this.getSubscription(tenantId);
    const limits = PLAN_LIMITS[sub.plan] || PLAN_LIMITS.free;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (action === 'simulation') {
      const count = await this.countEvents(tenantId, 'simulation', today);
      if (count >= limits.maxSimsPerDay) {
        return { allowed: false, reason: 'Daily simulation limit reached',
                 remaining: 0 };
      }
      return { allowed: true,
               remaining: limits.maxSimsPerDay - count };
    }

    if (action === 'prediction') {
      if (!limits.features.has('ml_predictions')) {
        return { allowed: false,
                 reason: 'ML predictions require Pro plan' };
      }
      return { allowed: true };
    }

    return { allowed: true };
  }

  async recordEvent(tenantId: string, userId: string,
                     eventType: string, metadata?: object) {
    await db.insert(usageEventsTable).values({
      tenantId, userId, eventType,
      metadata: metadata || null,
    });
  }

  private async countEvents(tenantId: string, eventType: string,
                            since: Date): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(usageEventsTable)
      .where(and(
        eq(usageEventsTable.tenantId, tenantId),
        eq(usageEventsTable.eventType, eventType),
        gte(usageEventsTable.createdAt, since),
      ));
    return result[0]?.count || 0;
  }

  private async getSubscription(tenantId: string) {
    const sub = await db.select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.tenantId, tenantId))
      .limit(1);
    return sub[0] || { plan: 'free', status: 'active' };
  }
}
```

### 4.4 Stripe Integration

```typescript
// artifacts/api-server/src/routes/billing.ts
import Stripe from 'stripe';
import { Router } from 'express';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const router = Router();

// Create checkout session
router.post('/checkout', authenticated, async (req, res) => {
  const { plan, seats = 1 } = req.body;
  const priceId = PLAN_PRICE_MAP[plan]; // pe_pro → price_xxx

  const session = await stripe.checkout.sessions.create({
    customer_email: req.auth.email,
    mode: 'subscription',
    line_items: [{
      price: priceId,
      quantity: plan === 'team' ? Math.max(seats, 5) : 1,
    }],
    metadata: {
      tenantId: req.tenantId,
      userId: req.auth.userId,
    },
    success_url: `${process.env.APP_URL}/settings/billing?success=true`,
    cancel_url: `${process.env.APP_URL}/settings/billing?canceled=true`,
  });

  res.json({ url: session.url });
});

// Stripe webhook handler
router.post('/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature']!;
    const event = stripe.webhooks.constructEvent(
      req.body, sig, process.env.STRIPE_WEBHOOK_SECRET!
    );

    switch (event.type) {
      case 'checkout.session.completed':
        await activateSubscription(event.data.object);
        break;
      case 'invoice.paid':
        await extendSubscription(event.data.object);
        break;
      case 'invoice.payment_failed':
        await markPastDue(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await downgradeToFree(event.data.object);
        break;
    }

    res.json({ received: true });
  }
);
```

---

## 5. Real-Time Prediction Delivery

### 5.1 Current State

The existing `/api/predict` endpoint is request-response REST. This works for on-demand predictions but doesn't support the target UX of "predictions update live as you drag components on the canvas."

### 5.2 Design: WebSocket + Debounced Prediction

```
┌──────────────────────────────────────────────────────────────┐
│                     Frontend (React)                          │
│                                                              │
│  CircuitCanvas.tsx                                           │
│    onNodesChange/onEdgesChange                               │
│      ↓                                                       │
│    Zustand store updates                                     │
│      ↓                                                       │
│    usePredictionStream() hook                                │
│      ├── Debounce circuit changes (150ms)                    │
│      ├── Serialize circuit to prediction request              │
│      ├── Send via WebSocket: { type: 'predict', circuit }    │
│      └── Receive: { type: 'prediction', results }            │
│             ↓                                                │
│           Update store.mlPredictions                          │
│             ↓                                                │
│           PhotonNode re-renders with predicted values         │
└────────────────────┬─────────────────────────────────────────┘
                     │ WebSocket (wss://)
                     ▼
┌──────────────────────────────────────────────────────────────┐
│                   Backend (Express 5 + ws)                    │
│                                                              │
│  WebSocket Server (ws library, shared HTTP server)           │
│    ├── Auth: validate JWT from ?token= query param           │
│    ├── Rate limit: max 10 predictions/second per tenant      │
│    └── Handler:                                              │
│          receive 'predict' → check plan → check rate limit   │
│            ↓                                                 │
│          GraphEncoder.encode(circuit)                         │
│            ↓                                                 │
│          ONNX Runtime inference (<5ms)                        │
│            ↓                                                 │
│          GraphEncoder.decode(output)                          │
│            ↓                                                 │
│          send 'prediction' + record usage event              │
└──────────────────────────────────────────────────────────────┘
```

### 5.3 WebSocket Server Implementation

```typescript
// artifacts/api-server/src/ws/prediction-server.ts
import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { verifyToken } from '@clerk/express';
import { mlInference } from '../lib/mlInference';
import { usageMeter } from '../services/usage-meter';

interface PredictionRequest {
  type: 'predict';
  requestId: string;
  circuit: { components: any[]; connections: any[] };
}

export function attachWebSocketServer(httpServer: Server) {
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws/predictions',
  });

  wss.on('connection', async (ws, req) => {
    // Auth via query param token
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    try {
      const session = await verifyToken(token!);
      const tenantId = session.orgId || session.sub;
      const userId = session.sub;

      // Check plan allows ML predictions
      const access = await usageMeter.canPerform(tenantId, 'prediction');
      if (!access.allowed) {
        ws.close(4003, access.reason);
        return;
      }

      // Rate limiter: token bucket, 10 req/sec
      const bucket = { tokens: 10, lastRefill: Date.now() };

      ws.on('message', async (data) => {
        try {
          const msg: PredictionRequest = JSON.parse(data.toString());
          if (msg.type !== 'predict') return;

          // Rate limit check
          const now = Date.now();
          const elapsed = (now - bucket.lastRefill) / 1000;
          bucket.tokens = Math.min(10, bucket.tokens + elapsed * 10);
          bucket.lastRefill = now;

          if (bucket.tokens < 1) {
            ws.send(JSON.stringify({
              type: 'rate_limited',
              requestId: msg.requestId,
            }));
            return;
          }
          bucket.tokens--;

          // Run inference
          const start = performance.now();
          const results = await mlInference.predict(msg.circuit);
          const latencyMs = performance.now() - start;

          ws.send(JSON.stringify({
            type: 'prediction',
            requestId: msg.requestId,
            results,
            latencyMs: Math.round(latencyMs * 100) / 100,
          }));

          // Record usage (fire-and-forget)
          usageMeter.recordEvent(tenantId, userId, 'prediction', {
            componentCount: msg.circuit.components.length,
            latencyMs,
          }).catch(() => {}); // Don't fail prediction on metering error

        } catch (err) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Prediction failed',
          }));
        }
      });

    } catch {
      ws.close(4001, 'Unauthorized');
    }
  });

  return wss;
}
```

### 5.4 Frontend Hook

```typescript
// artifacts/photonics-sim/src/hooks/usePredictionStream.ts
import { useRef, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { useSimulatorStore } from '../store/use-simulator-store';

export function usePredictionStream() {
  const wsRef = useRef<WebSocket | null>(null);
  const debounceRef = useRef<number>(0);
  const requestIdRef = useRef(0);
  const { getToken } = useAuth();
  const { nodes, edges, setMlPredictions, mlEnabled } = useSimulatorStore();

  // Connect WebSocket
  useEffect(() => {
    if (!mlEnabled) return;

    let ws: WebSocket;
    (async () => {
      const token = await getToken();
      const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(
        `${protocol}://${location.host}/ws/predictions?token=${token}`
      );

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'prediction') {
          setMlPredictions(msg.results);
        }
      };

      ws.onclose = (event) => {
        if (event.code === 4003) {
          // Plan doesn't support ML — disable
          useSimulatorStore.getState().setMlEnabled(false);
        }
      };

      wsRef.current = ws;
    })();

    return () => { ws?.close(); };
  }, [mlEnabled]);

  // Debounced prediction on circuit change
  useEffect(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      const circuit = serializeCircuit(nodes, edges);
      if (circuit.components.length === 0) return;

      wsRef.current!.send(JSON.stringify({
        type: 'predict',
        requestId: String(++requestIdRef.current),
        circuit,
      }));
    }, 150); // 150ms debounce

  }, [nodes, edges]);
}
```

---

## 6. Deployment Infrastructure

### 6.1 Decision: Railway (Stage 1) → AWS ECS (Stage 2)

| Factor | Railway | Vercel + Supabase | AWS ECS |
|--------|---------|-------------------|---------|
| WebSocket support | Native | Vercel: 30s limit | Full |
| Background jobs | Cron workers | Edge functions | ECS tasks |
| PostgreSQL | Managed Postgres | Supabase | RDS |
| ONNX Runtime (Node) | Custom Dockerfile | Not on Edge | Full control |
| GPU for training | No | No | GPU instances |
| Cost at 500 users | ~$50/mo | ~$40/mo | ~$150/mo |
| Cost at 10K users | ~$200/mo | ~$100/mo | ~$500/mo |
| On-prem option | No | No | Yes |

**Verdict:** Railway for launch (weeks 1–12). Migrate to ECS when Enterprise tier requires on-prem or GPU training infrastructure. Vercel is eliminated because the 30-second WebSocket timeout is incompatible with the real-time prediction stream.

### 6.2 Infrastructure Topology

```
┌─────────────────────────────────────────────────────────────┐
│                      Railway Project                         │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  Frontend     │  │  API Server  │  │  Python Sidecar  │  │
│  │  (Vite SSR    │  │  (Express 5  │  │  (FastAPI        │  │
│  │   or Static)  │  │   + WS + ML) │  │   Generative)    │  │
│  │              │  │              │  │                  │  │
│  │  Port: 5173  │  │  Port: 3000  │  │  Port: 8000      │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
│         │                 │                    │            │
│         └────────┬────────┘                    │            │
│                  │                             │            │
│  ┌───────────────▼─────────────────────────────▼──────────┐ │
│  │              Railway Internal Network                   │ │
│  │                                                        │ │
│  │  ┌──────────────────┐  ┌────────────────────────────┐  │ │
│  │  │  PostgreSQL 16   │  │  Redis (session cache +     │  │ │
│  │  │  (Railway Addon) │  │   rate limit counters)     │  │ │
│  │  └──────────────────┘  └────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Cron Worker (Railway scheduled)                       │  │
│  │    ├── Usage aggregation → Stripe metered billing      │  │
│  │    ├── Training data export (nightly)                  │  │
│  │    └── Stale session cleanup                           │  │
│  └────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘

External Services:
  ├── Clerk (auth)       → clerk.com
  ├── Stripe (billing)   → stripe.com
  ├── S3 (ONNX models)   → AWS S3
  └── Cloudflare (CDN)   → cloudflare.com
```

### 6.3 Dockerfile (API Server)

```dockerfile
# artifacts/api-server/Dockerfile
FROM node:20-slim AS base
RUN corepack enable pnpm

# Build stage
FROM base AS build
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY lib/ ./lib/
COPY artifacts/api-server/ ./artifacts/api-server/
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @workspace/api-server build

# Runtime stage
FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production

# ONNX Runtime needs specific shared libs
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/artifacts/api-server/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/artifacts/api-server/node_modules \
     ./artifacts/api-server/node_modules

# Model files mounted via volume or downloaded at startup
ENV ML_MODEL_PATH=/models/forward_surrogate.onnx

EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### 6.4 Docker Compose (Local Development)

```yaml
# docker-compose.yml
version: '3.8'
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: photonics
      POSTGRES_USER: photonics
      POSTGRES_PASSWORD: dev
    ports: ['5432:5432']
    volumes: ['pgdata:/var/lib/postgresql/data']

  redis:
    image: redis:7-alpine
    ports: ['6379:6379']

  api:
    build:
      context: .
      dockerfile: artifacts/api-server/Dockerfile
    ports: ['3000:3000']
    environment:
      DATABASE_URL: postgres://photonics:dev@postgres:5432/photonics
      REDIS_URL: redis://redis:6379
      CLERK_SECRET_KEY: ${CLERK_SECRET_KEY}
      STRIPE_SECRET_KEY: ${STRIPE_SECRET_KEY}
      ML_MODEL_PATH: /models/forward_surrogate.onnx
    volumes:
      - ./models:/models:ro
    depends_on: [postgres, redis]

  frontend:
    build:
      context: .
      dockerfile: artifacts/photonics-sim/Dockerfile
    ports: ['5173:5173']
    environment:
      VITE_API_URL: http://localhost:3000
      VITE_CLERK_PUBLISHABLE_KEY: ${VITE_CLERK_PUBLISHABLE_KEY}
      VITE_WS_URL: ws://localhost:3000

  training:
    build:
      context: artifacts/training-pipeline
    environment:
      API_URL: http://api:3000
    volumes:
      - ./data:/data
      - ./models:/models
    profiles: ['training']  # Only start with: docker compose --profile training up

volumes:
  pgdata:
```

---

## 7. Data Flow: Complete Request Lifecycle

### 7.1 Authenticated Simulation Request

```
1. User clicks "Simulate" in SimulationPanel
2. Frontend: POST /api/builds/:id/simulate
   Header: Authorization: Bearer <clerk_jwt>
3. Express middleware chain:
   a. clerkMiddleware() → validates JWT, sets req.auth
   b. requireAuth() → ensures valid session
   c. tenantScope() → sets req.tenantId
4. Route handler:
   a. usageMeter.canPerform(tenantId, 'simulation')
      → Checks plan limits, returns { allowed, remaining }
   b. If denied: 429 { error, upgradeUrl }
   c. db.select(builds).where(
        and(eq(id, buildId), eq(tenantId, req.tenantId))
      )
      → Tenant-scoped query (cannot access other tenants)
   d. photonicsEngine.simulate(build.layout)
   e. db.insert(simulations).values({
        tenantId: req.tenantId, buildId, ...results
      })
   f. usageMeter.recordEvent(tenantId, userId, 'simulation', {
        componentCount, latencyMs
      })
5. Response: 200 { simulationId, results, remaining: 7 }
```

### 7.2 Real-Time ML Prediction (WebSocket)

```
1. User drags a waveguide on CircuitCanvas
2. Zustand store updates (nodes, edges)
3. usePredictionStream hook fires (150ms debounce)
4. WebSocket send: { type: 'predict', circuit: {...} }
5. Server receives:
   a. Token bucket rate limit check (10/sec)
   b. GraphEncoder.encode(circuit) → tensor
   c. onnxSession.run(tensor) → raw output
   d. GraphEncoder.decode(output) → results
   e. WebSocket send: { type: 'prediction', results, latencyMs: 3.2 }
   f. usageMeter.recordEvent(...) [fire-and-forget]
6. Frontend receives prediction
7. setMlPredictions(results) → store update
8. PhotonNode components re-render with ML-predicted values
   (power badges, phase indicators, loss warnings)
```

---

## 8. Security Considerations

| Concern | Mitigation |
|---------|-----------|
| Tenant data isolation | All queries scoped by `tenant_id`; no cross-tenant joins possible |
| JWT validation | Clerk middleware validates signature + expiry on every request |
| WebSocket auth | Token validated on connection; connection closed if invalid |
| Rate limiting | Token bucket per tenant on WebSocket; Express rate-limit on REST |
| Stripe webhook integrity | `stripe.webhooks.constructEvent()` validates signature |
| SQL injection | Drizzle ORM parameterizes all queries |
| CORS | Explicit origin allowlist per environment |
| Secrets | Environment variables only; never in code or client bundle |
| ONNX model tampering | Model file hash verified on load; read-only mount in Docker |

---

## 9. Trade-Off Analysis

| Decision | Chose | Alternative | Why |
|----------|-------|-------------|-----|
| Auth provider | Clerk | Auth.js | SSO + org support saves 2+ weeks; cost negligible vs revenue |
| Multi-tenancy | Shared schema + row filter | Schema-per-tenant | Sufficient for 10K tenants; simpler migration, backup, queries |
| Real-time delivery | WebSocket (ws library) | SSE / polling | Bidirectional needed for prediction requests; sub-10ms latency |
| Hosting | Railway | AWS ECS | 10x faster to deploy; migrate to ECS when Enterprise demands it |
| Rate limiting | In-memory token bucket | Redis-backed | Single server at launch; move to Redis when horizontally scaling |
| Usage metering | PostgreSQL events table | Dedicated timeseries DB | Sufficient volume; add ClickHouse/TimescaleDB at 100K+ events/day |

---

## 10. Implementation Sequence

| Week | Deliverable | Dependencies |
|------|-------------|--------------|
| 1 | Clerk integration (frontend + backend middleware) | None |
| 2 | Schema migration (tenant_id, indexes, usage_events, subscriptions) | Week 1 |
| 3 | Tenant-scoped routes + usage metering service | Week 2 |
| 4 | Stripe products, checkout flow, webhook handlers | Week 3 |
| 5 | WebSocket prediction server + frontend hook | Week 1 (auth only) |
| 6 | Docker Compose + Railway deployment | Weeks 1–4 |
| 7 | Integration testing (auth → billing → metering → limits) | All above |
| 8 | Staging deploy, load test (100 concurrent WS connections), launch | Week 7 |

**Exit criteria for Phase 2:** A new user can sign up, design a circuit, run 10 free simulations, hit the limit, upgrade to Pro via Stripe checkout, and immediately see real-time ML predictions streaming as they edit. The system supports 500 concurrent users with <10ms prediction latency.

---

## 11. What to Revisit at Scale

| Trigger | Change |
|---------|--------|
| >1K concurrent WebSocket connections | Add Redis pub/sub for horizontal WS scaling |
| >100K usage events/day | Migrate to TimescaleDB or ClickHouse for event aggregation |
| Enterprise customer requests on-prem | Package as Helm chart; replace Clerk with self-hosted Keycloak |
| >50ms p99 prediction latency | Add model warm-up, connection pooling, consider GPU inference |
| >10K tenants | Evaluate schema-per-tenant or Citus distributed Postgres |
