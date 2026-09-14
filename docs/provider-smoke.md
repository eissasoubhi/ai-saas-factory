# Real provider smoke harness

The normal public CI intentionally runs without production provider credentials. Before a release, use the opt-in provider smoke command against disposable or test-mode resources.

## Required checks

```bash
OPENAI_API_KEY=... \
DATABASE_URL=postgresql://... \
pnpm smoke:providers
```

The command:

- resolves the same configured AI model registry used by the web runtime and sends a fixed synthetic prompt;
- embeds a fixed synthetic string through the configured embedding provider;
- creates a temporary pgvector table inside a transaction and proves nearest-neighbor retrieval returns the expected synthetic vector;
- emits one machine-readable JSON result and never logs credentials, prompts from users, documents, or database rows.

`OPENAI_API_KEY` and `DATABASE_URL` are required. The PostgreSQL target must have the `vector` extension installed.

## Optional S3/R2 check

Enable storage only when disposable/test storage credentials are available:

```bash
PROVIDER_SMOKE_STORAGE=true \
STORAGE_BUCKET=... \
STORAGE_REGION=... \
STORAGE_ENDPOINT=... \
STORAGE_ACCESS_KEY_ID=... \
STORAGE_SECRET_ACCESS_KEY=... \
OPENAI_API_KEY=... \
DATABASE_URL=... \
pnpm smoke:providers
```

The storage smoke creates a random synthetic text object through the same presigned-upload path, checks metadata, downloads and byte-compares it, then deletes it in `finally`.

This server-side smoke does **not** prove browser CORS. For S3/R2 release validation, also upload once from the real web Files UI and verify the configured origin/method/header CORS policy.

## Evidence

Store only the JSON result, commit SHA, target environment name and timestamp as release evidence. Never attach `.env` files, provider keys, signed URLs or raw provider responses.
