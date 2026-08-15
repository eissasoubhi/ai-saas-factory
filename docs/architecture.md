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
             │ files + pg-boss     │
             └──────────▲───────────┘
                        │ durable jobs
             ┌──────────┴───────────┐
             │    apps/worker       │
             │ background workers  │
             └──────────┬───────────┘
                        │ trusted object keys
                        ▼
             ┌──────────────────────┐
             │ S3-compatible store │
             │ S3 / R2 / MinIO     │
             └──────────▲───────────┘
                        │ presigned PUT/GET
                        │
                      browser

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

             ┌──────────────────────┐
             │   Model providers    │
             │ OpenAI now; more    │
             └──────────▲───────────┘
                        │ streamText
                        │
                    apps/web API
```

## Why one web server first

V1 deliberately keeps interactive product logic behind the Next.js server boundary instead of introducing a separate API service prematurely. This lowers deployment complexity for buyers. Long-running work is separated into `apps/worker`, and a Python service becomes optional only when AI workloads justify it.

## Multi-tenancy

Tenant context is an organization. Membership determines role. Paid feature access is derived from organization billing state and the entitlement policy package.

Never authorize a resource using only an organization ID supplied by the client. Resolve membership from the authenticated session on the server.

Tenant-owned AI and file data repeats `organization_id` at the persistence boundary. This is intentional defense in depth: queries can apply tenant scope directly instead of depending solely on parent joins.

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
- the AI route reserves monthly request entitlement before calling the model provider;
- the same reservation enforces an organization-level one-minute burst limit;
- UI pages display entitlement state but are not trusted for authorization.

A subscription receives paid entitlements only while its provider status is `active` or `trialing`. Other states fail closed to Free access.

## AI runtime

```text
browser message
      │
      ▼
POST /api/ai/chat
      │
      ├─ session + active organization
      ├─ conversation lookup scoped by organization
      ├─ provider:model allow-list
      ├─ pricing config validation
      ├─ plan resolution
      ├─ PostgreSQL advisory lock
      │     └─ reserve monthly + minute request quota
      ├─ persist user message
      ├─ reload server-owned message history
      ▼
AI SDK streamText ───────────────► model provider
      │                              │
      │ text stream                  │ provider usage
      ▼                              ▼
   browser                        onFinish
                                     │
                                     ├─ assistant message
                                     ├─ ai_generation
                                     └─ token/cost usage events
```

The client sends only a new user message plus an optional conversation/model ID. It cannot send trusted history. Model context is reconstructed from persisted tenant-scoped messages.

`apps/web/lib/ai-models.ts` owns the model registry and deployment allow-list. Product code uses stable `provider:model` IDs rather than provider-specific constructors.

Quota reservation is serialized per organization with a PostgreSQL transaction-scoped advisory lock. The monthly count, rolling one-minute count and new `ai.requests` event are handled while the lock is held, closing the usual concurrency hole around quota checks.

The HTTP response is a plain text stream. `consumeStream()` also consumes the result on the server so generation finalization can continue after a browser disconnect. The `onFinish` callback persists provider-reported token counts and optional deployment-configured cost estimates.

`ai_generation` is the per-generation ledger. `usage_event` remains the immutable metric ledger used for request, token and cost aggregation. See `docs/ai-runtime.md` for configuration and operational details.

## File storage flow

```text
browser
  │ upload metadata only
  ▼
POST /api/files/uploads
  │
  ├─ active organization from session
  ├─ validate MIME + expected bytes
  ├─ server UUID + opaque object key
  ├─ persist uploading row
  └─ presigned PUT
        │
        ▼
 S3-compatible storage
        │
        │ browser calls completion
        ▼
POST /api/files/:id/complete
  │
  ├─ tenant-scoped file lookup
  ├─ HeadObject
  ├─ exact size/MIME verification
  └─ enqueue file.verify
```

`packages/storage` is the only storage transport boundary. It uses the S3 protocol and configuration rather than embedding AWS/R2-specific product logic. Object keys are generated on the server from opaque tenant/file segments; APIs never accept a raw object key from the client.

The browser uploads directly to storage using a short-lived presigned PUT. This keeps file bytes out of the Next.js request path. Completion is a second server handshake that verifies actual object metadata before the file can enter durable processing.

Private downloads use a short-lived presigned GET only after a tenant-scoped lookup confirms the file is `ready`. Deletion resolves the trusted object key from PostgreSQL, removes the object, then soft-deletes metadata.

See `docs/storage-jobs.md` for provider/CORS configuration and operational details.

## Durable job flow

`packages/jobs` wraps pg-boss. The product already requires PostgreSQL, so durable file jobs can reuse that infrastructure instead of making Redis mandatory only for a queue.

The web runtime acts as a producer. `apps/worker` is a separate persistent process that owns workers and queue supervision.

```text
web producer
   │ { organizationId, fileId }
   ▼
pg-boss / PostgreSQL
   │ retries + backoff + DLQ
   ▼
apps/worker
   │
   ├─ parse minimal job contract
   ├─ reload file by organization + file ID
   ├─ obtain trusted object key from DB
   ├─ verify storage object
   └─ transition processing → ready / failed
```

Queue payloads deliberately exclude raw storage coordinates and credentials. Worker handlers repeat the tenant lookup before touching object storage. Missing, deleted or already-ready resources are idempotent no-ops.

The normal web producer does not own queue DDL migration privileges. Deployment/worker startup initializes pg-boss before uploads are accepted in an environment.
