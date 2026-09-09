# AI SaaS Factory

A commercial, AI-native B2B SaaS starter for teams that want to ship production web and mobile products without rebuilding authentication, organizations, billing, entitlements, persisted AI conversations, private files, durable jobs, tenant-isolated RAG, metering, audit logs, observability, and deployment foundations.

## Product direction

**V1:** Next.js web SaaS foundation.  
**V1.5:** Expo / React Native client sharing contracts and product logic.  
**V2:** Optional Python/FastAPI service for workloads that genuinely benefit from Python or independent scaling.

## Stack

- Next.js 16.2.x / React 19.2
- TypeScript
- PostgreSQL + Drizzle ORM + pgvector
- Better Auth with organizations and optional GitHub OAuth
- Stripe Checkout, Customer Portal and verified webhooks
- AI SDK 6 with centralized chat/embedding boundaries
- S3-compatible private storage via AWS SDK v3
- pg-boss durable PostgreSQL jobs
- `unpdf` server-side PDF extraction
- vendor-neutral structured JSON telemetry with aggressive redaction
- Expo SDK 57 / React Native 0.86
- Turborepo + pnpm
- Docker for local pgvector PostgreSQL, Redis and Mailpit

## Repository layout

```text
apps/
  web/         Next.js commercial web app
  worker/      durable ingestion/background worker
  mobile/      Expo mobile shell (V1.5)
  e2e/         Playwright browser validation
packages/
  db/          schema, migrations, billing, AI, files, vectors, audit and usage persistence
  documents/   extraction limits + deterministic document chunking
  embeddings/  embedding-model runtime boundary
  storage/     S3-compatible object storage + presigned URL policy
  jobs/        PostgreSQL queue contracts and producer/worker setup
  telemetry/   structured events, correlation IDs and recursive redaction
  contracts/   shared runtime schemas and API contracts
  entitlements/ plan and feature policy
  typescript-config/ shared TypeScript configuration
```

## Local setup

For the guided bootstrap:

```bash
corepack enable
corepack prepare pnpm@10.33.0 --activate
pnpm bootstrap
pnpm dev
```

The bootstrap creates `.env` from `.env.example` when missing, installs the frozen lockfile, starts local Docker services and applies committed migrations.

Manual equivalent:

```bash
cp .env.example .env
corepack enable
pnpm install --frozen-lockfile
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

The web foundation now includes production-oriented identity/workspaces, optional GitHub OAuth, Stripe subscription billing, subscription-backed entitlements, persisted AI conversations and metering, private object storage, durable PostgreSQL jobs, tenant-isolated RAG, audit/usage observability, organization API keys, signed outbound customer webhooks and an append-only usage-credit/overage model.

GitHub-hosted CI validates frozen dependency installation, Drizzle consistency, lint, typecheck, tests, production build, migration application to ephemeral PostgreSQL/pgvector and an authenticated Playwright browser flow.

The project is still pre-launch. Remaining high-value work includes Stripe metered overage submission/reconciliation, real-provider smoke tests, storage/retrieval quotas, the authenticated Expo client, and the final commercial packaging/demo/documentation pass.

See:

- `docs/roadmap.md`
- `docs/architecture.md`
- `docs/security.md`
- `docs/billing.md`
- `docs/ai-runtime.md`
- `docs/storage-jobs.md`
- `docs/rag.md`
- `docs/observability.md`
- `docs/deployment.md`
- `docs/release.md`
- `docs/versioning.md`
- `CHANGELOG.md`

## Pull request verification

This repository uses explicit issue acceptance criteria and PR validation notes, which makes it a useful real-world target for [PRTruth](https://github.com/eissasoubhi/PRTruth), an evidence-based pull request verification CLI.

For example, V0.2 issue `#1` and PR `#3` can be checked without modifying the repository:

```bash
npx -y prtruth@latest verify \
  --repo eissasoubhi/ai-saas-factory \
  --issue 1 \
  --pr 3 \
  --policy report-only
```

PRTruth compares issue requirements and PR completion claims with deterministic repository/CI evidence and reports `PROVEN`, `FAILED`, or `UNPROVEN` rather than treating a confident PR description as proof.

## Commercial intent

This source is being developed as a paid starter kit. The public repository does **not** grant an open-source license by default. Do not add an OSI license until the commercial distribution model is finalized. See `COMMERCIAL-LICENSE-DRAFT.md`.
