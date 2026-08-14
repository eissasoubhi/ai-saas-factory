# Architecture

## High-level

```text
             ┌──────────────────────┐
             │      apps/web        │
             │ Next.js / route API  │
             └──────────┬───────────┘
                        │
              ┌─────────┴──────────┐
              │ shared packages   │
              │ contracts/policy  │
              └─────────┬──────────┘
                        │
             ┌──────────▼───────────┐
             │      PostgreSQL      │
             │ auth/org/billing/AI │
             └──────────────────────┘

             ┌──────────────────────┐
             │     apps/mobile      │
             │ Expo / React Native │
             └──────────┬───────────┘
                        │ HTTPS
                        ▼
                    apps/web API
```

## Why one web server first

V1 deliberately keeps product logic behind the Next.js server boundary instead of introducing a separate API service prematurely. This lowers deployment complexity for buyers. A Python service becomes optional only when AI workloads justify it.

## Multi-tenancy

Tenant context is an organization. Membership determines role. Paid feature access is derived from organization billing state and the entitlement policy package.

Never authorize a resource using only an organization ID supplied by the client. Resolve membership from the authenticated session on the server.

## AI usage

Every billable AI call will eventually write an immutable usage event containing organization, actor, metric, quantity and idempotency key. Aggregate balances can be cached but usage events remain the audit source.

## Authentication flow (V0.2)

Better Auth owns identity, session, organization, membership and invitation persistence through the Drizzle adapter. The web application exposes the Better Auth handler under `/api/auth/*` and validates the server session again inside protected React Server Components.

The active organization is persisted in the Better Auth session. New accounts are routed through `/onboarding`, while returning sessions without an active organization bootstrap the first accessible organization client-side and refresh the server component tree.

Transactional email is intentionally represented as a small application boundary (`apps/web/lib/email.ts`) rather than being spread through auth callbacks. Development falls back to stdout; production requires explicit Resend configuration.
