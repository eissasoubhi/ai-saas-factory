# Platform API keys and outbound webhooks

V0.4C2 adds an organization-scoped integration surface without making browser sessions or internal infrastructure credentials part of the public API.

## API keys

Workspace owners/admins manage keys under `/settings/platform`.

A key looks like:

```text
asf_sk_<uuid>_<random-secret>
```

The raw token is returned only when the key is created or rotated. PostgreSQL stores the key id, a display prefix, scopes, lifecycle metadata and a SHA-256 hash of the full high-entropy token. The raw token is not stored and cannot be recovered later.

Clients send the token as:

```http
Authorization: Bearer asf_sk_...
```

The server parses the embedded key id, loads only an active/non-expired record, compares the hash in constant time and then enforces the required scope. Authentication never accepts an `organizationId` from the caller: the organization comes from the key record itself.

The first V1 example endpoint is:

```text
GET /api/v1/files
required scope: files:read
```

It returns file metadata only. Storage object keys and presigned storage URLs are not exposed.

### Current scopes

- `ai:read`
- `ai:write`
- `files:read`
- `files:write`
- `webhooks:read`
- `webhooks:write`

Only implemented routes should be advertised to customers. A scope existing in the allow-list does not imply that every corresponding V1 endpoint already exists.

## Outbound webhook endpoints

Owners/admins can create multiple endpoints per workspace. Each endpoint has an explicit event subscription list or `*`.

Supported event types in this slice:

- `webhook.test`
- `ai.generation.completed`
- `file.ready`
- `file.failed`
- `billing.subscription.updated`

Webhook payloads use a stable envelope:

```json
{
  "id": "evt_...",
  "type": "ai.generation.completed",
  "createdAt": "2026-08-16T12:00:00.000Z",
  "data": {
    "generationId": "...",
    "modelId": "openai:gpt-5-mini"
  }
}
```

Prompts, model output text, document bodies, object storage keys, provider credentials and signed storage URLs are not part of the default event payloads.

## Signing

A random signing secret is returned once at endpoint creation or secret rotation:

```text
whsec_...
```

The plaintext signing secret is never stored. It is encrypted with AES-256-GCM using the deployment-level `PLATFORM_SECRET_ENCRYPTION_KEY`. The worker decrypts it only in memory immediately before delivery.

Configure one stable 32-byte deployment key in both the web and worker runtimes:

```text
PLATFORM_SECRET_ENCRYPTION_KEY=<64 hex chars or 32-byte base64url value>
```

Do not change this environment value without a planned secret re-encryption migration; existing webhook endpoint secrets would otherwise become undecryptable.

For each delivery, the worker computes:

```text
signed_payload = <timestamp>.<event_id>.<exact_raw_body>
signature = HMAC-SHA256(signing_secret, signed_payload)
```

Headers:

```http
Content-Type: application/json
X-AI-SaaS-Event-Id: evt_...
X-AI-SaaS-Event-Type: file.ready
X-AI-SaaS-Timestamp: 1786896000
X-AI-SaaS-Signature: v1=<hex hmac>
```

Receivers should:

1. Read the exact raw request body before JSON parsing.
2. Reject timestamps outside a small tolerance window (for example five minutes).
3. Recompute the HMAC over `timestamp.eventId.rawBody`.
4. Compare signatures in constant time.
5. Store processed event ids and make processing idempotent.

A Node.js verification sketch:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

const payload = `${timestamp}.${eventId}.${rawBody}`;
const expected = createHmac('sha256', signingSecret).update(payload).digest('hex');
const received = signature.replace(/^v1=/, '');
const ok = expected.length === received.length &&
  timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'));
```

## Delivery reliability

Each customer event is persisted before enqueueing. A pg-boss job contains only `deliveryId`; URLs, payload bodies and signing secrets are reloaded server-side.

Delivery behavior:

- up to eight retries with exponential backoff;
- non-2xx responses are retryable failures;
- a disabled/deleted endpoint cancels future processing;
- exhausted jobs move to `outbound.webhook.deliver.dlq` and the delivery record becomes `dead`;
- delivery status/attempt count/HTTP status/errors are visible in `/settings/platform`;
- response bodies are deliberately not persisted or exposed in the UI.

The delivery uniqueness constraint `(endpoint_id, event_id)` prevents duplicate enqueueing of the same logical event for one endpoint.

## SSRF boundary

Outbound webhook URLs are treated as untrusted network destinations.

The platform requires HTTPS, rejects URL credentials/fragments, rejects localhost and `.local` names, resolves the hostname before delivery, rejects any private/link-local/loopback/multicast/documentation-range answer, pins the accepted IP for the HTTPS request, preserves TLS SNI for the original hostname, does not follow redirects, limits payloads to 256 KiB and applies a request timeout.

This is intentionally stricter than a generic `fetch(url)` implementation.

## Operational notes

- `PLATFORM_SECRET_ENCRYPTION_KEY` is mandatory to create/rotate/deliver webhooks.
- `JOBS_DATABASE_URL`/`DATABASE_URL` must be available to the web producer and worker.
- The worker must remain running for asynchronous webhook deliveries.
- Audit/telemetry events contain ids, event types, status/count metadata and HTTP status only; secrets and payload contents are excluded/redacted.
- API key rotation revokes the old key atomically before creating the replacement.
- Webhook secret rotation does not change the endpoint URL or subscriptions.
