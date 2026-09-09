# Release checklist

Use this checklist for tagged commercial releases. A green pull request is necessary but not sufficient: external providers need separate smoke evidence.

## Before tagging

- `main` is current and all intended PRs are merged.
- GitHub-hosted `quality` and `browser-e2e` jobs are green on the release commit.
- `pnpm install --frozen-lockfile`, Drizzle check, lint, typecheck, unit tests and production build are green.
- Migrations apply cleanly to a fresh PostgreSQL/pgvector database.
- No `.env`, provider key, auth cookie, signed URL or production credential is present in the diff/history being distributed.
- `CHANGELOG.md` has an entry for the version.
- The commercial license text for that release has been reviewed and is no longer marked draft for customer distribution.

## Production configuration

Run:

```bash
pnpm check:env -- --env .env.production
```

Resolve every error. Warnings are allowed only when the corresponding optional feature is intentionally disabled and documented for the release.

## External smoke evidence

Capture pass/fail plus timestamp for:

- Stripe test Checkout, portal and signed webhook
- one real AI generation with usage/cost persistence
- one S3/R2 browser upload, verification and download
- one document extraction/embedding/retrieval cycle
- one outbound signed customer webhook to public HTTPS
- one transactional email verification/reset flow

Do not capture secrets, raw prompt/document content or signed URLs in release notes.

## Deployment

1. Build immutable artifacts.
2. Back up/verify restore readiness for the production database.
3. Apply committed migrations.
4. Deploy the worker.
5. Deploy the web/API process.
6. Run application smoke checks.
7. Run external-provider smoke checks.
8. Watch structured telemetry, pg-boss dead-letter queues and audit events.

## After release

- Create the Git tag and GitHub release from the exact validated commit.
- Publish customer-facing release notes from `CHANGELOG.md`.
- Keep migration rollback/forward-fix notes with the release record.
- If a critical issue appears, prefer a small forward-fix release unless the database change is explicitly rollback-safe.
