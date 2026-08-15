# Tenant-isolated RAG

V0.4B2 turns private workspace files into searchable AI knowledge using the infrastructure already present in the starter: S3-compatible object storage, a PostgreSQL worker queue, PostgreSQL itself and the AI SDK.

## Components

- `packages/documents`: text/PDF extraction and deterministic chunking.
- `packages/embeddings`: the deployment embedding-model boundary.
- `packages/db/src/rag-schema.ts`: tenant-scoped `document_chunk` vectors.
- `packages/db/src/rag.ts`: atomic re-indexing and exact cosine retrieval.
- `apps/worker`: durable extraction/chunking/embedding pipeline.
- `apps/web/app/api/ai/chat/route.ts`: optional knowledge retrieval before chat generation.

## PostgreSQL and pgvector

Local Docker uses the pgvector-enabled PostgreSQL 17 image. Migration `0003_rag_vector.sql` enables the extension with:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

and stores embeddings in a fixed `vector(1536)` column.

A production database therefore needs permission to create/use the `vector` extension before the RAG migration is applied. If extension creation is managed by a database administrator, create it ahead of the application migration.

V0.4B2 deliberately uses exact cosine search first. There is no HNSW index in the baseline. Exact search preserves recall and keeps tenant filtering simple and predictable. Add an approximate index only after measuring the production dataset, latency and recall trade-off.

## Embedding configuration

```env
OPENAI_API_KEY=
AI_EMBEDDING_MODEL_ID=openai:text-embedding-3-small
AI_EMBEDDING_DIMENSIONS=1536
AI_EMBEDDING_MAX_PARALLEL_CALLS=2
```

The database column is fixed at 1536 dimensions. The runtime rejects another configured dimension instead of silently writing incompatible vectors.

Changing to an embedding model that produces a different vector size is a schema migration, not an environment-only change. Existing files also need re-indexing when the embedding model changes.

## Extraction and chunking

Supported extraction MIME types are:

- `application/pdf`
- `text/plain`
- `text/markdown`
- `text/csv`
- `application/json`

Text-like formats are decoded as UTF-8. PDFs are extracted in the worker with `unpdf`.

Resource limits are deployment-configured:

```env
DOCUMENT_MAX_PDF_PAGES=200
DOCUMENT_MAX_EXTRACTED_CHARS=2000000
DOCUMENT_EXTRACTION_TIMEOUT_MS=30000
RAG_CHUNK_CHARS=3000
RAG_CHUNK_OVERLAP_CHARS=300
```

The chunker is deterministic. It prefers paragraph, line and word boundaries, and records character offsets plus a rough token estimate. The extraction timeout is an application guard, not a hard OS-level CPU/memory sandbox; production workers should still run with container/process resource limits.

## Ingestion lifecycle

The browser never extracts or embeds documents. After the normal V0.4B1 upload handshake verifies object MIME and byte length, the web process enqueues `file.ingest` with only:

```text
{ organizationId, fileId }
```

The worker performs:

```text
load tenant-scoped file
        │
        ▼
verify S3 object metadata
        │
        ▼
read private object bytes
        │
        ▼
extract document text
        │
        ▼
deterministic chunking
        │
        ▼
batched embeddings
        │
        ▼
transaction + advisory lock
        │
        ├─ delete prior chunks for org + file
        ├─ insert replacement chunks/vectors
        └─ mark file ready
```

Replacement happens under a PostgreSQL transaction-scoped advisory lock per `(organizationId, fileId)`. Retries therefore replace the active chunk set rather than accumulating duplicate active chunks.

Embedding usage is written to `usage_event` as `ai.embedding_tokens`.

## Re-indexing and deletion

Ready, failed and uploaded files can be queued again through the re-index endpoint/UI. The worker reloads the file from PostgreSQL; the client never provides the storage key.

Deleting a file takes the same per-file advisory lock, removes its `document_chunk` rows, and soft-deletes the file metadata. The object-storage deletion remains handled by the file API using the trusted database key.

## Retrieval

Knowledge mode embeds the current user question and performs exact cosine search. Retrieval is defense-in-depth tenant scoped:

- `document_chunk.organization_id` must equal the authenticated active organization;
- the joined `stored_file.organization_id` must equal the same organization;
- the file must be `ready` and not deleted;
- returned rows are asserted again against the active organization before entering model context.

Deployment controls:

```env
RAG_RETRIEVAL_LIMIT=6
RAG_MIN_SIMILARITY=0.35
```

Only compact source metadata is returned to the browser (`fileId`, filename, chunk index, similarity). Retrieved document text stays server-side.

## Prompt-injection boundary

Retrieved documents are untrusted data. The RAG system addition explicitly wraps them in a `<knowledge>` block and instructs the model not to obey role changes, policies, commands or tool requests found inside documents.

This reduces prompt-injection risk but does not make arbitrary documents trusted. Any future tools/actions must have their own authorization checks and should never become available merely because retrieved text asks for them.

## Source citations

Retrieved chunks are labeled `[S1]`, `[S2]`, and so on in the model context. The current chat UI displays the matching filename, chunk index and similarity for the live response.

V0.4B2 does not yet persist a historical citation object on conversation messages. Persisted, queryable citation/audit history can be added with the platform observability work if the product requires it.

## Production smoke test

Before launch, validate the complete path with non-production credentials:

1. apply migrations to a PostgreSQL instance with pgvector;
2. configure an S3/R2 test bucket and CORS;
3. start the web process and worker;
4. upload a text file and a representative PDF;
5. confirm the worker reaches `ready` and creates chunks;
6. ask a question with **Use workspace knowledge** enabled;
7. verify the answer references the expected source marker;
8. repeat with two organizations and verify neither can retrieve the other's content;
9. re-index and delete a document, then verify old chunks are no longer retrievable;
10. test malformed/large PDFs and worker retries/dead-letter handling.
