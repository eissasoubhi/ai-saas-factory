# AI SaaS Factory

A commercial, AI-native B2B SaaS starter for teams that want to ship production web and mobile products without rebuilding authentication, organizations, billing, entitlements, persisted AI conversations, private files, durable jobs, tenant-isolated RAG, metering, audit logs, and deployment foundations.

## Product direction

**V1:** Next.js web SaaS foundation.  
**V1.5:** Expo / React Native client sharing contracts and product logic.  
**V2:** Optional Python/FastAPI service for workloads that genuinely benefit from Python or independent scaling.

## Stack

- Next.js 16.2.x / React 19.2
- TypeScript
- PostgreSQL + Drizzle ORM + pgvector
- Better Auth with organizations
- Stripe Checkout, Customer Portal and verified webhooks
- AI SDK 6 with centralized chat/embedding boundaries
- S3-compatible private storage via AWS SDK v3
- pg-boss durable PostgreSQL jobs
- `unpdf` server-side PDF extraction
- Expo SDK 57 / React Native 0.86
- Turborepo + pnpm
- Docker for local pgvector PostgreSQL, Redis and Mailpit

## Repository layout

```text
apps/
  web/         Next.js commercial web app
  worker/      durable ingestion/background worker
  mobile/      Expo mobile shell (V1.5)
packages/
  db/          schema, migrations, billing, AI, files, vectors and usage persistence
  documents/   extraction limits + deterministic document chunking
  embeddings/  embedding-model runtime boundary
  storage/     S3-compatible object storage + presigned URL policy
  jobs/        PostgreSQL queue contracts and producer/worker setup
  contracts/   shared runtime schemas and API contracts
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

`pnpm dev` runs workspace development tasks, including the background worker. Run the worker independently with `pnpm worker:start`.

`pnpm db:generate` creates a migration after intentional Drizzle schema changes. A fresh checkout applies the committed migration history with `pnpm db:migrate`.

Private files require a configured S3-compatible bucket. RAG additionally requires an embedding provider key and PostgreSQL with pgvector. The local Docker image already includes pgvector.

## Current status

V0.2 provides production-oriented identity and workspace plumbing. V0.3 adds organization-scoped Stripe billing, webhook reliability, subscription-backed entitlements and team-seat enforcement.

V0.4A adds persisted tenant-scoped AI conversations, server-owned history, model allow-listing, atomic monthly/per-minute request reservation, provider token capture, configurable cost estimation and streaming chat.

V0.4B1 adds private S3-compatible files, direct presigned browser uploads, post-upload validation and durable PostgreSQL jobs.

V0.4B2 adds the end-to-end knowledge pipeline: PDF/text extraction, deterministic chunking, batched embeddings, pgvector persistence, retry-safe re-indexing, exact tenant-scoped cosine retrieval, a **Use workspace knowledge** chat mode, source markers and prompt-injection boundaries for retrieved documents.

The project is still pre-launch: OAuth examples, browser E2E coverage, real Stripe/provider/storage/RAG smoke tests, storage/retrieval quotas, mobile billing and commercial packaging remain on the roadmap.

See:

- `docs/roadmap.md`
- `docs/architecture.md`
- `docs/security.md`
- `docs/billing.md`
- `docs/ai-runtime.md`
- `docs/storage-jobs.md`
- `docs/rag.md`

## Commercial intent

This source is being developed as a paid starter kit. Do not add an open-source license until the commercial distribution model is finalized. See `COMMERCIAL-LICENSE-DRAFT.md`.
