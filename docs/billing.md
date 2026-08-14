# Billing and entitlements

V0.3 uses Stripe Checkout and the Stripe Customer Portal for subscription UX, while the application database remains the source of truth for authorization decisions.

## Required environment variables

```env
APP_URL=http://localhost:3000
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_PRO=price_...
STRIPE_API_VERSION=2026-04-22.dahlia
```

Create recurring monthly prices for the Starter and Pro products in Stripe test mode and copy their price IDs into the environment.

## Webhook endpoint

Register this endpoint in Stripe Workbench:

```text
POST /api/webhooks/stripe
```

Subscribe at minimum to:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

For local development, forward Stripe CLI events to `http://localhost:3000/api/webhooks/stripe` and use the webhook secret printed by the CLI.

## Security model

Billing routes never accept an organization identifier from a form or query string. The workspace is derived from the authenticated session's active organization. Only owners and admins can create Checkout or Customer Portal sessions.

A successful Checkout browser redirect does **not** grant paid access. Paid entitlements are derived from the local `subscription` row after a verified Stripe webhook updates it.

Webhook requests are checked against the raw request body and `Stripe-Signature`. The verifier accepts `v1` signatures only and rejects timestamps outside a five-minute window.

## Idempotency and event ordering

Every Stripe event is stored in `webhook_event` with the provider event ID under a unique constraint. A fresh event is claimed once. Failed events can be retried, and an abandoned processing claim becomes reclaimable after five minutes.

Stripe does not guarantee webhook delivery order, so subscription-related events use the event object only to identify the subscription and then retrieve the current subscription state from Stripe before synchronizing PostgreSQL. `provider_updated_at` still prevents an older event from overwriting a state already synchronized from a newer event. This also makes replay of different events created in the same second converge on the same authoritative subscription state.

## Entitlement policy

Only Stripe subscriptions in `active` or `trialing` state receive their paid plan. Other states fail closed to the Free plan until billing is repaired.

Current server-enforced limits include:

- team seats, enforced in Better Auth organization hooks;
- monthly AI requests, enforced before the AI provider is called.

The billing settings page exposes the effective plan, provider state, seat usage and monthly AI request usage.

## Database migrations

The repository contains a Drizzle-generated baseline migration for the complete current schema:

```text
packages/db/drizzle/0000_init.sql
packages/db/drizzle/meta/_journal.json
packages/db/drizzle/meta/0000_snapshot.json
```

On a fresh database run:

```bash
pnpm db:migrate
```

When intentionally changing `packages/db/src/schema.ts`, generate and review the next migration with `pnpm db:generate`, commit the SQL and Drizzle metadata, then let CI run `drizzle-kit check`.

## Production notes

- Use separate Stripe test and live secrets.
- Configure the Customer Portal in Stripe before enabling the Portal button.
- Rotate webhook secrets periodically.
- Keep server clocks synchronized because webhook replay protection depends on timestamp tolerance.
- Run a real Stripe test-mode Checkout and webhook smoke test before deploying a release.
