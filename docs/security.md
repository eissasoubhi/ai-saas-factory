# Security baseline

- Cookies and sessions are handled by Better Auth.
- Organization authorization is checked separately from authentication.
- Secrets live only in server environment variables.
- Tenant-scoped operations derive the active organization from the authenticated server session rather than trusting a client-supplied organization ID.
- Paid feature access is derived from local subscription state synchronized by verified provider webhooks.
- Invitations require verified ownership of the invited email.
- Audit logs must not record access tokens, passwords, raw session tokens, webhook secrets or provider API keys.
- Abuse-sensitive operations are enforced at server boundaries rather than relying on hidden UI controls.

## Identity and workspace controls

- Email/password sessions require verified email ownership.
- Password reset revokes existing sessions.
- Organization invitation acceptance requires the authenticated, verified recipient.
- Protected pages validate the full server session; the Next.js proxy is only an early redirect layer.
- Organization-scoped actions rely on Better Auth server-side permission checks. UI role checks are convenience, not authorization.
- Transactional email uses Resend over HTTPS and must be configured explicitly in production.

## Billing controls

- Checkout and Customer Portal operations are available only to workspace owners and admins.
- Billing endpoints never accept an organization ID from a browser form or query string; they resolve the active workspace from the authenticated session.
- A Checkout success redirect never grants paid access. Entitlements change only after verified Stripe state is synchronized into PostgreSQL.
- Stripe webhook signatures are calculated from the exact raw request body and the `Stripe-Signature` header using HMAC-SHA256.
- Webhook timestamps outside the five-minute tolerance window are rejected to reduce replay risk.
- Provider event IDs are unique in `webhook_event`, making completed event replays safe.
- Failed or abandoned processing claims can be retried without applying a successfully completed event twice.
- `subscription.provider_updated_at` prevents an older provider event from overwriting newer subscription state.
- A Stripe customer already mapped to one workspace cannot silently be reassigned through conflicting webhook metadata.
- Paid plan entitlements are granted only for `active` or `trialing` subscriptions; other provider states fail closed to Free access.
- Team seat limits are enforced in Better Auth organization hooks, not only in the settings UI.

## AI runtime controls

- Conversation reads, archives and deletes are always scoped by both conversation ID and the authenticated active organization ID.
- The AI route never trusts client-supplied history. It reconstructs model context from tenant-scoped persisted messages.
- Model selection is constrained by a server-side allow-list. A model/provider not registered by the deployment is rejected before a provider call.
- AI pricing configuration is validated before a request consumes quota, preventing malformed pricing data from creating partial metering records after generation.
- Monthly request entitlements and per-minute rate limits are enforced before the provider is called.
- Quota reservation is serialized per organization with a PostgreSQL transaction-scoped advisory lock. Concurrent requests cannot all reserve the same remaining quota slot.
- User messages, assistant messages and generation metadata all carry organization scope in PostgreSQL.
- Provider-reported token counts are stored separately from estimated price. Cost remains null when deployment pricing is absent rather than inventing a price.
- Streaming is consumed server-side to let persistence complete after a browser disconnect; model calls therefore may continue to incur cost after the client disconnects.
- Conversation archive makes the chat read-only server-side; deletion is organization-scoped and cascades to messages/generations.
- Raw provider API keys, prompts from unrelated tenants and hidden provider responses must never be written to audit metadata.

## File storage and worker controls

- File APIs derive the active organization from the authenticated session. The browser never sends a trusted organization ID, bucket or object key.
- Object keys are created only on the server using opaque organization/file segments plus a sanitized display filename.
- Storage access/secret keys remain server-only. They are never returned with presigned URLs.
- Presigned URLs are short-lived, single-operation bearer capabilities. Do not log query strings containing signatures.
- Browser PUT uploads require an explicit bucket CORS policy restricted to trusted application origins and required methods/headers.
- The upload-init route validates declared MIME and byte length before signing.
- Completion performs `HeadObject` and requires actual size and content type to match the server-approved declaration before a job is queued.
- Invalid uploaded objects are removed from storage and the file metadata is marked failed.
- Downloads are signed only for files in `ready` state and only after a `(organizationId, fileId)` lookup succeeds.
- Delete operations resolve the object key from trusted PostgreSQL state, delete the object, then soft-delete file metadata.
- pg-boss payloads contain only organization ID and file ID. Workers never accept raw storage coordinates from queue messages.
- The worker reloads the file under the job organization and treats missing/cross-tenant resources as no-op rather than falling back to an unscoped lookup.
- Deterministic size/MIME policy violations complete as failed jobs; transient storage errors are re-thrown for pg-boss retry/backoff.
- The normal web producer does not auto-migrate the pg-boss schema. Worker/deployment setup owns queue DDL privileges.

## Required pre-launch review

- auth/session configuration
- CSRF and origin policy
- OAuth redirect allow-list
- invitation takeover cases
- tenant isolation integration tests against PostgreSQL
- Stripe test-mode Checkout and Customer Portal smoke test
- real signed webhook delivery and replay tests
- duplicate and out-of-order subscription event tests
- real AI-provider smoke test for every enabled model
- AI request race/concurrency load test near quota limits
- conversation retention/export/delete policy
- model-specific prompt/tool authorization boundaries
- S3/R2 test bucket with production-equivalent CORS
- presigned URL expiry and leaked-URL response procedure
- upload completion race/retry behavior
- worker crash/retry/dead-letter behavior
- file retention and storage lifecycle policy
- malware/content scanning policy before accepting arbitrary public uploads
- AI prompt/file authorization boundaries
- rate limiting and abuse controls beyond the organization request limiter
