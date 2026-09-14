# API key and outbound webhook smoke checks

This document separates deterministic CI coverage from the external public-HTTPS smoke that requires deployment credentials.

## CI coverage

The repository verifies two critical integration boundaries without production secrets:

- API-key authentication derives the organization only from the persisted API-key record. Browser-supplied organization headers do not influence the principal.
- signed webhook receiver behavior validates the exact raw body, rejects tampering, enforces a five-minute timestamp window and rejects a repeated event id.

These tests do not bypass the production SSRF policy. Localhost remains invalid as an outbound webhook destination in production code.

## Local receiver harness

For receiver-side integration work, run the disposable localhost harness:

```bash
WEBHOOK_SMOKE_SECRET=whsec_replace_me node scripts/webhook-smoke-receiver.mjs
```

It listens only on `127.0.0.1:8787` by default, validates the production signature format, enforces the five-minute timestamp window and rejects duplicate event ids. It intentionally does **not** alter the production outbound sender: production webhook targets still require public HTTPS and still pass SSRF validation.

Use this harness to develop customer receiver logic or replay handling. Do not register its localhost URL as a production Platform webhook endpoint.

## Live public HTTPS smoke

Use a disposable public HTTPS receiver when validating a deployed environment.

1. Create a webhook endpoint from Platform settings and copy the signing secret once.
2. Subscribe it to a low-risk event such as `file.ready`.
3. Trigger the event in a non-production workspace.
4. Verify the receiver gets `x-ai-saas-event-id`, `x-ai-saas-event-type`, `x-ai-saas-timestamp` and `x-ai-saas-signature`.
5. Compute HMAC-SHA256 over `<timestamp>.<eventId>.<exact raw body>` and compare the hex digest to the `v1=` signature using a timing-safe comparison.
6. Persist the event id before applying the side effect; reject a repeated id as replay.
7. Confirm Platform settings show the delivery as sent. Exercise a temporary receiver failure and verify retry/DLQ status without changing endpoint security policy.

Do not log the signing secret, API key, Authorization header or complete sensitive payloads as release evidence.
