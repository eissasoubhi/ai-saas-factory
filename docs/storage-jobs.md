# Storage and durable jobs

V0.4B1 provides private tenant-scoped object storage and the durable PostgreSQL worker foundation. V0.4B2 extends the same `file.ingest` job through extraction, chunking and embeddings.

## Architecture

```text
browser
  │ POST /api/files/uploads
  ▼
Next.js ── creates file row + opaque tenant object key
  │
  └── short-lived presigned PUT ─────────────┐
                                              ▼
                                      S3-compatible storage
                                              │
  POST /api/files/:id/complete                │ HEAD
  │                                           ▼
  ├── validates actual size + MIME ◄──── Next.js
  ├── marks file uploaded
  └── enqueue file.ingest ───────────────► pg-boss/PostgreSQL
                                              │
                                              ▼
                                         apps/worker
                                              │
                                              ├── reload file by org + file ID
                                              ├── re-check stored object
                                              ├── extract + chunk + embed
                                              └── persist vectors → ready / failed
```

The browser never chooses an object key, bucket, organization prefix or worker storage coordinate.

## Storage configuration

The adapter uses AWS SDK v3 and supports AWS S3 plus S3-compatible endpoints.

```env
STORAGE_BUCKET=my-private-bucket
STORAGE_REGION=us-east-1
STORAGE_ENDPOINT=
STORAGE_ACCESS_KEY_ID=
STORAGE_SECRET_ACCESS_KEY=
STORAGE_FORCE_PATH_STYLE=false
STORAGE_SIGNED_URL_TTL_SECONDS=300
STORAGE_MAX_UPLOAD_BYTES=26214400
STORAGE_ALLOWED_CONTENT_TYPES=application/pdf,text/plain,text/markdown,text/csv,application/json
```

### AWS S3

Leave `STORAGE_ENDPOINT` empty and use the actual AWS region. Credentials can be omitted when the runtime already provides them through the AWS credential provider chain.

### Cloudflare R2

```env
STORAGE_REGION=auto
STORAGE_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
STORAGE_ACCESS_KEY_ID=<R2_ACCESS_KEY_ID>
STORAGE_SECRET_ACCESS_KEY=<R2_SECRET_ACCESS_KEY>
```

Browser uploads require an appropriate bucket CORS policy for the web application's origin. A minimal development policy is conceptually:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000"],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Use explicit production origins instead of `*`.

## Object keys

Object keys are generated only on the server:

```text
org/<opaque organization segment>/files/<opaque file segment>/<sanitized filename>
```

The raw key is never accepted from a browser API or pg-boss payload.

## Upload handshake

1. Browser sends filename, declared MIME and size to `POST /api/files/uploads`.
2. Server validates policy, creates a UUID/object key, persists `uploading`, and returns a short-lived presigned PUT.
3. Browser PUTs directly to object storage with the approved `Content-Type`.
4. Browser calls `POST /api/files/:id/complete`.
5. Server resolves the file under the active organization and requires `HeadObject` byte length + MIME to match the original declaration.
6. Valid uploads become `uploaded` and enqueue `file.ingest`. Invalid objects are deleted and marked `failed`.

The completion endpoint is retryable. If the queue is unavailable, the validated file remains `uploaded` and can be submitted again.

## Downloads and deletion

`GET /api/files/:id/download` returns a short-lived presigned GET only for a `ready` file belonging to the active organization.

`DELETE /api/files/:id` resolves the trusted object key from PostgreSQL. The RAG chunk set is removed under the tenant/file lock and metadata is soft-deleted; object deletion is performed by the file API.

Treat presigned URLs like bearer tokens. Keep TTLs short and never log URLs containing signatures.

## Durable jobs

```env
JOBS_DATABASE_URL=
JOBS_SCHEMA=pgboss
JOBS_MIGRATE_ON_START=true
```

`JOBS_DATABASE_URL` falls back to `DATABASE_URL`.

Run the worker with:

```bash
pnpm worker:start
```

The worker starts pg-boss, creates `file.ingest` plus `file.ingest.dlq`, and processes jobs with retry/backoff.

The normal web producer does not auto-migrate the pg-boss schema. Initialize queue DDL during deployment/worker startup before accepting uploads.

## Job security and idempotence

A file job contains only:

```json
{
  "organizationId": "...",
  "fileId": "..."
}
```

It deliberately excludes `objectKey`. The worker reloads the file using both IDs and gets storage coordinates from trusted PostgreSQL state.

`file.ingest` uses singleton behavior keyed by `fileId`, retries/backoff and a dead-letter queue. Re-indexing uses the same job. Chunk replacement is transactionally protected by a tenant/file advisory lock, so retries replace active vectors instead of accumulating duplicates.

Deterministic storage size/MIME violations delete the invalid object and stop. Extraction, embedding and transient infrastructure failures are marked failed and re-thrown so pg-boss can retry.

See `docs/rag.md` for extraction, pgvector, embeddings, retrieval and prompt-injection controls.
