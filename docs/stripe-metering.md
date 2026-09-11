# Stripe metered AI overage

V0.4D2 turns the immutable AI credit ledger into durable Stripe Billing Meter events for eligible closed periods.

## Accounting boundary

Stripe is never fed reservation rows. Reconciliation reads only settled `ai.generation` credit-ledger entries and calculates the portion of settled model cost above the period's included credits.

A period is eligible for metered overage only when its own immutable ledger contains a `plan.monthly` grant whose plan reference is `pro`. The current subscription plan is deliberately not used for historical eligibility, so a later upgrade cannot retroactively make an older Starter month billable.

Only closed UTC months can be reconciled. Each Stripe event is timestamped at the final UTC second of the reconciled month rather than at delivery time.

## Stripe setup

Create a Billing Meter whose event name matches `STRIPE_AI_OVERAGE_METER_EVENT_NAME`. Configure the meter to aggregate the `value` payload field for the Stripe customer identified by `stripe_customer_id`.

The application submits integer USD micros. For example, `250000` represents `$0.25`. The Stripe price attached to the meter must therefore be configured consistently with this unit before enabling production reconciliation.

Required runtime values for live delivery:

- `STRIPE_SECRET_KEY`
- `STRIPE_AI_OVERAGE_METER_EVENT_NAME`
- `DATABASE_URL` or `JOBS_DATABASE_URL` for pg-boss

`STRIPE_API_VERSION` remains configurable and defaults to the repository's pinned Stripe API version.

## Reconciliation flow

Workspace owners/admins open **Settings → AI usage**, choose a closed month and run **Reconcile & queue**.

The server:

1. derives the workspace from the authenticated Better Auth session;
2. verifies that the month is closed;
3. reloads the Stripe customer from the workspace subscription;
4. acquires a PostgreSQL advisory lock for that workspace/month;
5. reads immutable monthly grants/adjustments and settled AI-generation costs;
6. creates deterministic `stripe_meter_submission` rows only for eligible overage;
7. enqueues pending/failed submissions by durable submission ID only.

No Stripe secret, customer ID, meter name or usage payload is stored in pg-boss job data.

## Idempotency and retries

Each overage allocation is tied to one credit-ledger settlement and has a unique database constraint. The Stripe `identifier` is derived deterministically from that ledger entry and the request also carries a stable Stripe idempotency key.

The worker claims a submission with a processing lease, retries transient failures through pg-boss, and marks exhausted jobs `dead` through the DLQ. Stale `processing` claims can be recovered after the lease interval.

Failed/dead submissions can be re-queued from the usage screen. A retry only operates on a submission belonging to the active workspace.

## Operator checks before enabling production overage

- Run a Stripe test-mode reconciliation for a closed synthetic period.
- Confirm the event appears on the intended Stripe customer and meter.
- Verify the meter's price interprets one submitted unit as one USD micro according to your billing design.
- Replay reconciliation for the same month and confirm no duplicate chargeable usage is created.
- Force a worker failure, verify retry/DLQ status, then exercise the manual retry action.
- Compare the sum of sent meter submissions with the internal closed-period overage calculation before enabling live billing.

The usage dashboard is an operational ledger view; Stripe remains the provider of record for invoiced totals.
