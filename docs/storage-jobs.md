# Storage and durable jobs

V0.4B1 provides private tenant-scoped object storage and a durable PostgreSQL worker foundation for the later RAG ingestion pipeline.

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
  └── enqueue file.verify ───────────────► pg-boss/PostgreSQL
                                              │
                                              ▼
                                         apps/worker
                                              │
                                              ├── reload file by org + file ID
                                              ├── re-check stored object
                                              └── processing → ready / failed
```

The browser never chooses an object key, bucket, organization prefix or worker storage coordinate.

## Storage configuration

The adapter uses AWS SDK v3 and therefore supports AWS S3 plus S3-compatible endpoints.

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

Leave `STORAGE_ENDPOINT` empty and use the real AWS region. Credentials can be omitted when the runtime already provides them through the AWS credential provider chain.

### Cloudflare R2

Use:

```env
STORAGE_REGION=auto
STORAGE_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
STORAGE_ACCESS_KEY_ID=<R2_ACCESS_KEY_ID>
STORAGE_SECRET_ACCESS_KEY=<R2_SECRET_ACCESS_KEY>
```

R2 exposes an S3-compatible API and supports presigned GET/PUT URLs. Browser uploads also require an appropriate bucket CORS policy for the web application's origin. Presigned R2 URLs use the S3 API domain rather than a custom domain.

A minimal development CORS policy is conceptually:

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

Organization/file identifiers are encoded into opaque URL-safe segments. User-supplied filenames are normalized and cannot add path separators.

The raw key is never accepted from a browser API or pg-boss payload.

## Upload handshake

1. Browser sends filename, declared MIME and size to `POST /api/files/uploads`.
2. Server validates policy, creates a server UUID and object key, creates a short-lived presigned PUT, and persists the `uploading` file row.
3. Browser PUTs directly to object storage with the signed `Content-Type`.
4. Browser calls `POST /api/files/:id/complete`.
5. Server resolves the file under the active organization, performs `HeadObject`, and requires actual byte length + MIME to match the original server-approved declaration.
6. Valid uploads become `uploaded` and enqueue the durable verification job. Invalid objects are deleted and marked `failed`.

The completion endpoint is retryable. If the job service is temporarily unavailable, the validated file remains `uploaded` and can be submitted again.

## Downloads and deletion

`GET /api/files/:id/download` returns a short-lived presigned GET only for a `ready` file belonging to the active organization.

`DELETE /api/files/:id` deletes the private object first and then soft-deletes its metadata row. The file remains in the database for audit/lifecycle purposes but disappears from the normal file list.

Treat presigned URLs like bearer tokens: anyone holding an unexpired URL can perform its signed operation. Keep TTLs short and never log URLs containing signatures.

## Durable jobs

V0.4B1 uses pg-boss because the product already requires PostgreSQL and pg-boss provides durable queues, retries/backoff and dead-letter behavior without adding Redis solely for jobs.

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

The worker starts pg-boss, creates the `file.verify` and `file.verify.dlq` queues, and processes jobs.

The web producer does not auto-migrate the pg-boss schema. This keeps DDL privileges out of the normal web runtime. Initialize the worker/job schema during deployment before accepting uploads, or run the worker with migration enabled.

## Job security and idempotence

A file job contains only:

```json
{
  "organizationId": "...",
  "fileId": "..."
}
```

It deliberately excludes `objectKey`. The worker reloads the file using both IDs and gets the storage key from trusted PostgreSQL state.

The `file.verify` queue uses singleton behavior keyed by `fileId`, retry/backoff, and a dead-letter queue. The handler is also state-idempotent: a deleted or already-ready file is a no-op.

Transient storage errors mark the file failed and are re-thrown so pg-boss can retry. Deterministic size/MIME mismatches delete the object, mark the file failed, and complete the job without pointless retries.

## Next: V0.4B2 RAG

The RAG slice will start from files in `ready` state and add:

- extraction per supported MIME;
- chunk persistence;
- embeddings provider abstraction;
- tenant-scoped vector retrieval;
- re-index/delete lifecycle;
- retrieval/storage entitlements.
