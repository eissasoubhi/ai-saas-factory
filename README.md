# AI SaaS Factory

A commercial, AI-native B2B SaaS starter for teams that want to ship production web and mobile products without rebuilding authentication, organizations, billing, entitlements, persisted AI conversations, private files, durable jobs, metering, audit logs, and deployment foundations.

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
- AI SDK 6 with centralized model registry
- S3-compatible private storage via AWS SDK v3
- pg-boss durable PostgreSQL jobs
- Expo SDK 57 / React Native 0.86
- Turborepo + pnpm
- Docker for local PostgreSQL, Redis and Mailpit

## Repository layout

```text
apps/
  web/       Next.js commercial web app
  worker/    durable pg-boss background worker
  mobile/    Expo mobile shell (V1.5)
packages/
  db/        schema, migrations, billing, AI, file and usage persistence
  storage/   S3-compatible object storage + presigned URL policy
  jobs/      PostgreSQL queue contracts and producer/worker setup
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

`pnpm dev` runs workspace development tasks, including the background worker. You can run the worker independently with `pnpm worker:start`.

`pnpm db:generate` is for creating a new migration after intentionally changing the Drizzle schema. A fresh checkout should apply the committed migration history with `pnpm db:migrate`.

Private file uploads also require a configured S3-compatible bucket. See `docs/storage-jobs.md` for AWS S3 / Cloudflare R2 setup and browser CORS requirements.

## Current status

V0.2 provides production-oriented identity and workspace plumbing. V0.3 adds organization-scoped Stripe billing, webhook reliability, subscription-backed entitlements and team-seat enforcement.

V0.4A adds organization-scoped persisted AI conversations, server-owned history, model allow-listing, atomic monthly/per-minute request reservation, provider token capture, configurable cost estimation and a usable streaming chat UI.

V0.4B1 adds private tenant-scoped S3-compatible files, direct presigned browser uploads, post-upload validation and a durable PostgreSQL worker foundation. V0.4B2 will build extraction, embeddings and tenant-isolated RAG on top of files that reach `ready` state.

The project is still pre-launch: OAuth examples, browser E2E coverage, real Stripe/provider/storage smoke tests, RAG, mobile billing and commercial packaging remain on the roadmap.

See:

- `docs/roadmap.md`
- `docs/architecture.md`
- `docs/security.md`
- `docs/billing.md`
- `docs/ai-runtime.md`
- `docs/storage-jobs.md`

## Commercial intent

This source is being developed as a paid starter kit. Do not add an open-source license until the commercial distribution model is finalized. See `COMMERCIAL-LICENSE-DRAFT.md`.
