# Storage and RAG quotas

Storage and retrieval quotas are server-owned plan policy. The browser never supplies an organization id or an authoritative plan/limit value.

## Default plan limits

| Plan | Active stored files | Reserved storage bytes | RAG top-k |
| --- | ---: | ---: | ---: |
| Free | 5 | 25 MiB | 3 |
| Starter | 100 | 1 GiB | 6 |
| Pro | 1,000 | 10 GiB | 10 |

The source of truth is `@factory/entitlements` (`storageRetrievalQuota`). Deployments can change product policy in that package and validate the same policy through unit tests.

## Storage accounting

Upload initialization derives the active organization from the authenticated server session and derives its paid plan from persisted subscription state. It does not trust a browser-provided organization, plan, count or byte total.

Before issuing a presigned upload URL, PostgreSQL acquires a transaction-scoped advisory lock for the organization, counts all non-deleted stored files and sums their reserved bytes. An uploading file counts immediately, using `expectedSizeBytes`; after upload verification, `actualSizeBytes` is used when available. The file row and its reserved capacity are created in the same transaction.

This prevents two concurrent upload initializations from both observing the same remaining capacity and exceeding the plan limit. If presign generation fails after the reservation, the row is soft-deleted so it stops consuming capacity.

Quota rejection returns only safe counters and limits. Object keys and presigned URLs are never included in quota telemetry or error payloads.

## Downgrades

A downgrade never deletes customer data automatically. Existing files remain readable and retrievable. If the workspace is already above its new file-count or byte allowance, further uploads are rejected until usage falls below the current plan limit or the plan is upgraded.

## Retrieval

`searchDocumentChunks` resolves the workspace subscription on the server and clamps the requested retrieval size to the plan's `retrievalTopK`. The existing database hard cap of 20 remains defense in depth. Tenant filters on both `document_chunk` and `stored_file` remain unchanged.

`RAG_RETRIEVAL_LIMIT` is therefore a deployment preference, not a way to bypass a plan quota: effective top-k is the minimum of the requested/deployment limit and the active plan limit.

## Verification

CI covers quota-policy boundaries. Browser E2E continues to validate the existing authenticated application flow. Before launch, real-provider smoke tests should additionally confirm storage behavior against the chosen S3/R2 provider and RAG retrieval against the production pgvector/embedding stack.
