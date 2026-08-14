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

             ┌──────────────────────┐
             │       Stripe         │
             │ Checkout / Portal   │
             └──────────┬───────────┘
                        │ signed webhooks
                        ▼
                    apps/web API
```

## Why one web server first

V1 deliberately keeps product logic behind the Next.js server boundary instead of introducing a separate API service prematurely. This lowers deployment complexity for buyers. A Python service becomes optional only when AI workloads justify it.

## Multi-tenancy

Tenant context is an organization. Membership determines role. Paid feature access is derived from organization billing state and the entitlement policy package.

Never authorize a resource using only an organization ID supplied by the client. Resolve membership from the authenticated session on the server.

## Authentication flow

Better Auth owns identity, session, organization, membership and invitation persistence through the Drizzle adapter. The web application exposes the Better Auth handler under `/api/auth/*` and validates the server session again inside protected React Server Components.

The active organization is persisted in the Better Auth session. New accounts are routed through `/onboarding`, while returning sessions without an active organization bootstrap the first accessible organization client-side and refresh the server component tree.

Transactional email is intentionally represented as a small application boundary (`apps/web/lib/email.ts`) rather than being spread through auth callbacks. Development falls back to stdout; production requires explicit Resend configuration.

## Billing flow

Billing is organization-scoped. Checkout and Customer Portal routes resolve the active organization from the authenticated session and never accept a tenant ID from the client.

```text
owner/admin
   │
   ├─ POST /api/billing/checkout ──► Stripe Checkout
   │                                  │
   │                                  ▼
   │                          signed webhook events
   │                                  │
   ▼                                  ▼
settings/billing ◄──────────── local subscription row
                                      │
                                      ▼
                              entitlement policy
```

The browser success redirect is informational only. Paid access is granted from the local subscription state after a verified webhook is processed.

`webhook_event` provides event-ID idempotency, retry metadata and an expiring processing claim. `subscription.provider_updated_at` prevents an older Stripe event from overwriting newer provider state.

Stripe transport is isolated behind `apps/web/lib/stripe.ts`. The initial implementation uses Stripe's form-encoded REST API directly, which keeps the starter dependency-light while preserving a narrow boundary that can be replaced by the official SDK without changing product code.

## Entitlement enforcement

The `packages/entitlements` package contains static plan limits, while the effective plan is resolved from server-side subscription state.

Enforcement happens at server boundaries:

- Better Auth organization hooks reject invitations or member additions beyond the seat limit.
- the AI route checks monthly organization usage before calling the model provider;
- UI pages display entitlement state but are not trusted for authorization.

A subscription receives paid entitlements only while its provider status is `active` or `trialing`. Other states fail closed to Free access.

## AI usage

Billable AI calls write immutable usage events containing organization, actor, metric, quantity and idempotency key. Monthly limits are calculated from those events. Aggregate balances can later be cached, but usage events remain the audit source.
