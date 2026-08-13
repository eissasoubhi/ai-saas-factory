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
  db/        database schema and client
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
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Web: http://localhost:3000  
Mailpit: http://localhost:8025

## Current status

This repository is the **foundation milestone**, not a finished marketplace product. It intentionally establishes the architecture and product boundaries first. The next milestone completes authentication UX, onboarding, organizations, billing, email and entitlement enforcement.

See `docs/roadmap.md`.

## Commercial intent

This source is being developed as a paid starter kit. Do not add an open-source license until the commercial distribution model is finalized. See `COMMERCIAL-LICENSE-DRAFT.md`.
