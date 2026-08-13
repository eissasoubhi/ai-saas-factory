# AGENTS.md

## Mission

Build AI SaaS Factory as a commercial starter kit, not a demo. Prefer boring, maintainable primitives and clear extension points over clever abstractions.

## Product invariants

1. `apps/web` is production-capable on its own.
2. Mobile must share contracts and product rules without importing server-only code.
3. PostgreSQL is the source of truth for tenants, billing state, usage and audit data.
4. Authentication and authorization are distinct: session validity does not imply organization permission.
5. Every paid feature must be enforceable server-side through entitlements.
6. AI usage must be meterable and attributable to a user and organization.
7. Webhook handlers must be idempotent.
8. Never expose secrets to client bundles.
9. Prefer stable releases over RC/canary packages for the commercial baseline.

## Package boundaries

- `@factory/db`: server-only database package. Never import into client components or mobile.
- `@factory/contracts`: safe for browser, server and mobile.
- `@factory/entitlements`: pure policy package; no network or DB access.
- `apps/web`: orchestration, route handlers and UI.
- `apps/mobile`: mobile UI and API consumption only.

## Code rules

- TypeScript strict mode.
- Validate external input with Zod at boundaries.
- Do not add `any` to bypass type errors.
- Database migrations must be reviewed; do not use schema push in production docs.
- Add tests for billing, authorization, usage metering and webhook idempotency.
- New environment variables must be documented in `.env.example`.
- New product decisions go in `docs/decisions/`.

## Validation before PR

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
