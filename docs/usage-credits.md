# Usage credits and overage policy

V0.4D1 adds an internal, append-only usage-credit ledger alongside the existing immutable AI usage events. It does not replace `usage_event` or `ai_generation`; those remain the source of truth for measured model usage and estimated cost.

## Units

Credit values use integer USD micros (`1 USD = 1,000,000 micros`) so accounting does not depend on floating-point arithmetic.

The current plan policy is deliberately configurable in code and can evolve independently from Stripe price IDs:

- Free: 100,000 micros/month, hard stop at zero;
- Starter: 5,000,000 micros/month, hard stop at zero;
- Pro: 50,000,000 micros/month, overage permitted.

These are starter defaults, not provider pricing. The real generation debit still comes from the existing model pricing registry (`AI_MODEL_PRICING_JSON`).

## Append-only ledger

`usage_credit_ledger` stores signed immutable entries. Positive entries add available balance; negative entries consume it. Every mutation has an idempotency key, and reads are always scoped by organization and UTC month.

Entry types currently used:

- `grant`: monthly plan allowance or an upgrade top-up;
- `reservation`: a conservative debit taken before an AI request is allowed to reach the provider;
- `settlement`: the difference between the reservation and the measured generation cost;
- `adjustment`: reserved for future explicit administrative/billing reconciliation flows.

Entries are never rewritten to change history.

## Monthly grants and plan changes

The plan allowance is granted lazily on the first AI request of a UTC month. Granting runs under a PostgreSQL advisory transaction lock.

A plan upgrade only tops the organization up to the new monthly target. Example: if Starter has already granted 5 USD-equivalent credits and the workspace upgrades to Pro with a 50 USD-equivalent allowance, the ledger adds only the 45 difference. It never stacks two full allowances.

A downgrade does not claw back credits already granted for the current month. The lower target naturally applies on the next month. This avoids retroactively rewriting the period's accounting history.

## Reservation and settlement

Before quota consumption and before the model provider is called, the server reserves `AI_CREDIT_RESERVATION_MICROS` (default `100000`). Reservation is serialized per organization/month with a PostgreSQL advisory lock.

For plans with overage disabled, a reservation that would cross below zero is rejected before provider work starts. For overage-enabled plans, a negative balance is permitted and becomes input for the future metered-billing reconciliation slice.

When the request is rejected before generation (quota, retrieval or persistence failure), the reservation is released through an idempotent zero-cost settlement. On successful generation, the reservation is settled against the existing estimated model cost.

If actual estimated cost is lower than the reservation, unused micros are returned. If it is higher, the settlement creates the additional debit instead of hiding the real measured cost.

## Pricing requirement

Meaningful cost settlement requires `AI_MODEL_PRICING_JSON` to contain pricing for the selected model. If pricing is absent, the existing cost estimator returns no cost and D1 releases the reservation after generation rather than inventing a price.

This is intentional: accounting must not fabricate provider costs. Production deployments that enforce monetary-style credits should configure the pricing registry for every allowed model.

## UI and observability

Owner/admin `/settings/usage` shows:

- current-month ledger balance;
- plan monthly allowance;
- whether overage is allowed;
- existing request/token/cost telemetry.

The AI runtime emits structured telemetry for credit rejection, reservation release failure and settlement failure. The existing generation audit event includes reservation and overage metadata without prompts or generated text.

## Deferred to V0.4D2

D1 is the internal accounting and enforcement boundary. A later billing slice should add:

- durable reconciliation for any stuck reservation/settlement states;
- Stripe metered usage submission when the chosen Stripe price supports it;
- provider/Stripe reconciliation reports;
- customer-facing overage invoice detail and billing alerts;
- controlled administrative adjustments with explicit audit records.
