# Sample vertical — Workspace Knowledge Assistant

The sample vertical is intentionally a composition of existing starter primitives rather than a second product architecture.

## Flow

1. A user signs in and selects an active organization.
2. Private files are uploaded through the existing signed storage flow.
3. The worker verifies, extracts, chunks and embeds the document.
4. The chat route optionally retrieves organization-scoped chunks and treats document text as untrusted reference data.
5. AI request, token, configured-cost and credit usage are recorded server-side.
6. Completed AI/file lifecycle events can be delivered through signed outbound webhooks.

## Security boundaries

- the browser never supplies trusted organization authorization;
- private object coordinates remain server-owned;
- RAG retrieval stays tenant-scoped;
- sample content does not add authentication bypasses or privileged demo users;
- no provider credentials are required to browse the demo shell;
- billing and entitlements remain server-authoritative.

## Why this vertical

A workspace knowledge assistant exercises the most differentiated pieces of the starter in one understandable workflow: auth, organizations, private storage, durable jobs, embeddings, RAG, AI accounting, billing and integrations.

The `/demo` route is intentionally read-only presentation content. Product actions continue to use the normal authenticated application surfaces.
