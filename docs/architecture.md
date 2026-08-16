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
             │ files/jobs/pgvector │
             └──────────▲───────────┘
                        │ durable jobs
             ┌──────────┴───────────┐
             │    apps/worker       │
             │ extract/embed/index │
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
             │   Model providers    │
             │ chat + embeddings   │
             └──────────▲───────────┘
                        │
               apps/web + worker
```

## Runtime boundaries

V1 keeps interactive product logic behind the Next.js server boundary rather than introducing a separate API service prematurely. Long-running work lives in `apps/worker`. A separate Python service remains optional only when workloads genuinely require a Python ecosystem or independent scaling boundary.

The browser is never a trusted source of tenant IDs, storage coordinates, conversation history or RAG context. Server/worker code reconstructs those values from authenticated sessions and PostgreSQL state.

## Multi-tenancy

Tenant context is an organization. Membership determines role. Paid feature access is derived from organization billing state and the entitlement policy package.

Tenant-owned AI, file and RAG data repeats `organization_id` at important persistence boundaries. This is deliberate defense in depth: queries can filter directly by tenant instead of depending only on parent joins.

## Authentication flow

Better Auth owns identity, session, organization, membership and invitation persistence through the Drizzle adapter. The web application exposes the Better Auth handler under `/api/auth/*` and validates the server session again inside protected React Server Components.

The active organization is persisted in the Better Auth session. New accounts are routed through `/onboarding`, while returning sessions without an active organization bootstrap the first accessible organization and refresh the server component tree.

Transactional email is isolated behind `apps/web/lib/email.ts`. Development can log mail payloads; production requires explicit provider configuration.

## Billing and entitlements

Billing is organization-scoped. Checkout and Customer Portal routes resolve the active organization from the authenticated session and never accept a tenant ID from the browser.

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

The browser success redirect is informational only. Paid access is granted from local subscription state after verified provider events are processed.

Server boundaries enforce entitlements: Better Auth organization hooks enforce seats, and the AI route atomically reserves monthly request quota plus an organization-level minute burst quota before provider calls.

## AI runtime

```text
browser message
      │
      ▼
POST /api/ai/chat
      │
      ├─ session + active organization
      ├─ tenant-scoped conversation lookup
      ├─ provider:model allow-list
      ├─ pricing validation
      ├─ atomic request quota reservation
      ├─ optional RAG retrieval
      ├─ persist user message
      └─ reload server-owned history
             │
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

The client sends only a new user message plus optional conversation/model/knowledge-mode fields. It cannot send trusted conversation history. Streaming is also consumed server-side so final persistence can complete after a browser disconnect.

`apps/web/lib/ai-models.ts` owns chat model selection. `packages/embeddings` owns the embedding-model boundary. Both use stable deployment configuration rather than scattering provider constructors through product code.

## File storage flow

```text
browser
  │ metadata only
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
        │ completion handshake
        ▼
POST /api/files/:id/complete
  │
  ├─ tenant-scoped file lookup
  ├─ HeadObject
  ├─ exact size/MIME verification
  └─ enqueue file.ingest
```

`packages/storage` is the storage transport boundary. Browser file bytes go directly to the object store through short-lived presigned capabilities; application credentials and raw object keys remain server-side.

Private downloads receive a short-lived presigned GET only after a tenant-scoped lookup confirms a ready file. See `docs/storage-jobs.md` for provider and CORS configuration.

## Durable ingestion flow

`packages/jobs` wraps pg-boss on the existing PostgreSQL database. The web runtime is a producer; `apps/worker` is a separate persistent process that owns queue supervision and long-running ingestion.

```text
web producer
   │ { organizationId, fileId }
   ▼
pg-boss / PostgreSQL
   │ retries + backoff + DLQ
   ▼
apps/worker
   │
   ├─ parse minimal tenant-scoped job
   ├─ reload file + trusted object key
   ├─ verify storage object
   ├─ read private bytes
   ├─ extract text
   ├─ deterministic chunking
   ├─ batch embeddings
   └─ atomic chunk replacement → ready
```

Queue payloads exclude storage coordinates and credentials. Re-indexing uses the same ingestion job and an advisory lock keyed by tenant/file, so retries replace the active chunk set instead of accumulating duplicates.

## RAG persistence and retrieval

Local PostgreSQL uses the pgvector-enabled PostgreSQL 17 image. Migration `0003_rag_vector.sql` enables `vector` and creates `document_chunk` with `vector(1536)` embeddings.

```text
user question
    │
    ▼
embedding model
    │ query vector
    ▼
PostgreSQL exact cosine search
    │
    ├─ document_chunk.organization_id = active org
    ├─ stored_file.organization_id = active org
    ├─ stored_file.status = ready
    └─ stored_file.deleted_at IS NULL
    │
    ▼
assertOrganizationScope
    │
    ▼
<knowledge> untrusted context + [S1] markers
    │
    ▼
chat model
```

The baseline intentionally uses exact cosine similarity instead of an approximate vector index. This preserves recall and keeps tenant filters straightforward. HNSW is a later scale optimization when measured dataset size and latency justify it.

Retrieved document text is explicitly treated as untrusted reference data. Source content stays server-side; the browser receives only compact source metadata for the live answer.

Deleting a file removes its chunks under the same per-file advisory lock before the file is soft-deleted. Re-indexing transactionally replaces old chunks with new vectors and marks the file ready only after successful persistence.

See `docs/rag.md` for configuration, limits, security behavior and the production smoke-test checklist.

## Audit, usage and telemetry

V0.4C1 keeps three signals separate:

```text
product action
   │
   ├─ durable audit event ─────────► audit_log / PostgreSQL
   │                                   │
   │                                   └─ /settings/audit
   │
   ├─ immutable usage event ───────► usage_event / PostgreSQL
   │                                   │
   │                                   └─ /settings/usage
   │
   └─ sanitized runtime event ─────► JSON stdout/stderr
                                       │
                                       └─ deployment log pipeline
```

Audit and usage queries always derive the tenant from the authenticated active organization. Audit pagination uses a deterministic descending `(createdAt, id)` cursor, and returned audit rows pass a second organization assertion before rendering.

`packages/telemetry` is the vendor-neutral operational boundary used by web and worker runtimes. It generates/reuses correlation IDs and recursively removes auth material, secrets, prompts, document/request/response content and signed URLs before JSON serialization.

AI generation completion writes usage metrics and a bounded audit record containing IDs/model/tokens/cost/duration only. Worker ingestion emits duration/result events around durable jobs. Neither path sends customer prompt/document text through the telemetry boundary.

Audit failures after an external side effect are non-fatal: the primary product action remains successful and the failed audit write becomes structured error telemetry. See `docs/observability.md` for retention, routing and pre-launch checks.
