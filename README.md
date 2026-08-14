# AI SaaS Factory

A commercial, AI-native B2B SaaS starter for teams that want to ship production web and mobile products without rebuilding authentication, organizations, billing, entitlements, AI streaming, audit logs, and deployment foundations.

## Product direction

**V1:** Next.js web SaaS foundation.  
**V1.5:** Expo / React Native client sharing contracts and product logic.  
**V2:** Optional Python/FastAPI service for workloads that genuinely benefit from Python (RAG pipelines, ML, long-running AI jobs).

## Stack

- Next.js 16.2.x / React 19.2
- TypeScript
- PostgreSQL + Drizzle ORM
- Better Auth with organizations
- Stripe Checkout, Customer Portal and verified webhooks
- AI SDK 6
- Expo SDK 57 / React Native 0.86
- Turborepo + pnpm
- Docker for local PostgreSQL, Redis and Mailpit

## Repository layout

```text
apps/
  web/       Next.js commercial web app
  mobile/    Expo mobile shell (V1.5)
packages/
  db/        database schema, migrations and billing/usage persistence
  contracts/ shared runtime schemas and API contracts
  entitlements/ plan and feature policy
  typescript-config/ shared TypeScript configuration
```

## Local setup

```bash
cp .env.example .env
corepack enable
pnpm install
docker compose up -d
pnpm db:migrate
pnpm dev
```

Web: http://localhost:3000  
Mailpit: http://localhost:8025

`pnpm db:generate` is for creating a new migration after intentionally changing the Drizzle schema. A fresh checkout should apply the committed migration history with `pnpm db:migrate`.

## Current status

V0.2 provides production-oriented identity and workspace plumbing. V0.3 adds organization-scoped Stripe billing, webhook reliability, subscription-backed entitlements, team-seat enforcement and monthly AI usage limits.

The project is still pre-launch: OAuth examples, browser E2E coverage, rate limiting, the broader AI product layer, mobile billing and commercial packaging remain on the roadmap.

See:

- `docs/roadmap.md`
- `docs/architecture.md`
- `docs/security.md`
- `docs/billing.md`

## Commercial intent

This source is being developed as a paid starter kit. Do not add an open-source license until the commercial distribution model is finalized. See `COMMERCIAL-LICENSE-DRAFT.md`.
