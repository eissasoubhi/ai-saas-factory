# Observability, audit and AI usage

V0.4C1 adds an operational visibility layer without turning application logs into a second copy of customer data.

## Three separate signals

AI SaaS Factory deliberately separates:

1. **Audit log** — durable organization-scoped product events in PostgreSQL for actions a workspace may need to review later.
2. **Usage ledger** — immutable `usage_event` records used for AI request/token/cost aggregation.
3. **Structured telemetry** — JSON operational events emitted by web/worker processes for runtime monitoring and incident response.

Do not merge these responsibilities. Audit history is a product/security record, usage is billing/metering data, and telemetry is an operational stream.

## Audit viewer

`/settings/audit` resolves the active organization from the authenticated server session. It never accepts a trusted `organizationId` from a query string or browser form.

The database query always filters on `audit_log.organization_id` and applies a second organization assertion before rows are returned to the page.

Pagination uses a bounded `(createdAt, id)` cursor ordered descending. Page size is clamped to 1–100 with a default of 50. Optional `action` and `entityType` filters are bounded before becoming query predicates.

High-value events include:

- organization created/updated;
- invitation created/accepted;
- member added/removed/role updated;
- Stripe Checkout and Customer Portal starts;
- private file upload/completion/re-index/delete;
- completed AI generations.

Audit writes are intentionally **non-fatal after the primary product action succeeds**. If Stripe has already created a Checkout session or S3 has already deleted an object, an audit-database outage must not return a false product failure. The failed audit write is emitted as structured error telemetry instead.

## AI usage dashboard

`/settings/usage` aggregates the current UTC month directly from immutable `usage_event` rows scoped to the active organization.

Tracked metrics currently include:

- `ai.requests`;
- `ai.input_tokens`;
- `ai.output_tokens`;
- `ai.embedding_tokens`;
- `ai.cost_micros` when deployment pricing is configured.

The page shows monthly totals plus daily and per-model breakdowns. Cost visibility is restricted to workspace owners/admins. A missing price remains unknown/null at generation time; the system does not invent provider cost.

`ai.cost_micros` is an **estimate based on deployment-configured model pricing**, not a provider invoice. Provider billing remains the source of truth for actual spend.

## Structured telemetry

`@factory/telemetry` emits one JSON object per event. Core fields are:

```json
{
  "timestamp": "2026-08-16T12:00:00.000Z",
  "level": "info",
  "name": "web.ai.generation_completed",
  "component": "web",
  "correlationId": "request-or-generated-id",
  "durationMs": 842,
  "organizationId": "org-id",
  "userId": "user-id",
  "attributes": {}
}
```

Web requests reuse a valid incoming `x-request-id`; otherwise the telemetry boundary generates a UUID. Worker jobs derive a stable correlation identifier from the durable job ID where available.

The JSON format is intentionally vendor-neutral. Production deployments can route stdout/stderr to OpenTelemetry collectors, Datadog, Grafana/Loki, CloudWatch or another log pipeline without changing product code.

## Redaction policy

The telemetry boundary recursively redacts sensitive keys and content before serialization. The same sanitizer is used before audit metadata is persisted.

Redacted categories include:

- authorization headers and cookies;
- passwords and session/access/refresh tokens;
- API/provider/storage/webhook secrets;
- prompts and message/document bodies;
- request/response bodies when supplied as telemetry metadata;
- signed storage URLs, including signatures found under otherwise innocuous attribute keys.

Error serialization keeps only error name and a bounded message. Stack traces are not emitted by the shared telemetry event object.

Safe operational metadata can include IDs, model IDs, plan/status values, token counts, file MIME types, chunk counts, finish reasons, durations and configured cost estimates.

## AI lifecycle events

The chat endpoint emits operational events for:

- quota/rate-limit rejection;
- RAG retrieval failure;
- generation completion;
- background stream consumption failure.

A successful generation audit/telemetry record can contain the generation ID, conversation ID, provider/model, finish reason, token totals, configured cost estimate, duration and number of retrieved chunks. It must never contain the user prompt, model response text or retrieved document text.

## Worker ingestion events

The durable file-ingestion worker emits start/success/failure telemetry with organization ID, file ID, job/correlation ID, duration and bounded operational metadata. Object-storage keys, signed URLs and document contents are excluded.

## Production routing

For production, ship JSON stdout/stderr through the platform logging layer rather than writing local log files from the application process. Recommended controls:

- restrict log access by environment/role;
- define retention separately from customer database retention;
- alert on repeated `*.failed`, queue/DLQ and quota-abuse patterns;
- use correlation IDs when tracing a request across web and worker boundaries;
- sample high-volume success events if needed, but never sample away durable audit records that the product promises to retain.

## Pre-launch checks

Before commercial launch, verify:

- no deployment middleware adds raw headers/bodies around the shared sanitizer;
- audit retention/export/delete policy is documented for customers;
- log transport and destination encryption/access controls;
- cost estimates match the configured model pricing snapshot;
- organization cross-tenant integration tests against a real PostgreSQL database;
- worker/web correlation IDs are visible in the chosen production log backend;
- incident response procedure for a leaked signed URL or credential.
