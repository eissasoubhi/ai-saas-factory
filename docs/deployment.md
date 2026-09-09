# Deployment guide

AI SaaS Factory is designed to run as two application processes backed by managed infrastructure:

- `apps/web`: public Next.js web/API process
- `apps/worker`: private background worker
- PostgreSQL with pgvector
- S3-compatible private object storage
- optional Redis only where a deployment chooses to add it; durable jobs use PostgreSQL/pg-boss

## Required production characteristics

1. Serve `APP_URL` and `BETTER_AUTH_URL` over HTTPS.
2. Run committed Drizzle migrations before switching application traffic to a release that depends on them.
3. Run at least one worker process with the same `DATABASE_URL`/`JOBS_DATABASE_URL` and storage/provider configuration as the web process.
4. Keep Stripe, AI, storage and platform encryption secrets server-side only.
5. Keep the object bucket private; browsers access objects only through short-lived signed URLs.
6. Persist PostgreSQL independently of application containers and back it up according to the hosting provider's documented restore procedure.

## Release order

```text
1. Build immutable web + worker artifacts
2. Validate production environment configuration
3. Apply committed database migrations
4. Deploy worker
5. Deploy web/API
6. Run health/product smoke checks
7. Run configured external-provider smoke checks
8. Observe telemetry, queue failures and audit logs
```

Rollback application code only when the database migration is backwards compatible. Destructive or irreversible schema changes require an explicit expand/migrate/contract rollout instead of a one-step rollback assumption.

## Environment validation

Prepare the production environment without committing it, then run:

```bash
pnpm check:env -- --env .env.production
```

The validator fails on missing core database/auth/billing configuration and warns when optional provider-dependent product capabilities cannot be smoke-tested.

## Web process

```bash
pnpm install --frozen-lockfile
pnpm --filter @factory/web build
pnpm --filter @factory/web start
```

The public platform must forward the original HTTPS host/protocol correctly so Better Auth callback URLs and Stripe return URLs remain canonical.

## Worker process

```bash
pnpm install --frozen-lockfile
pnpm --filter @factory/worker start
```

Only trusted application code should run the worker. It consumes file-ingestion and outbound-webhook queues and requires access to PostgreSQL plus configured server-side provider credentials.

## Database migrations

```bash
pnpm db:migrate
```

Do not run `db:generate` in production. Migration generation belongs in development/PRs; production applies the committed history.

## External smoke matrix

Automated GitHub CI proves lint, type safety, unit tests, production build, migrations against ephemeral PostgreSQL/pgvector, and browser E2E. It does **not** prove external account configuration.

Before a commercial release, separately verify:

- Stripe test-mode Checkout + real signed webhook delivery
- AI provider generation with the configured model allow-list
- embedding provider + pgvector retrieval
- S3/R2 browser upload/download CORS and private-object policy
- outbound customer webhook delivery to a public HTTPS receiver
- transactional email delivery and links

Record the date, environment and operator for each smoke result; never paste provider secrets into the record.
