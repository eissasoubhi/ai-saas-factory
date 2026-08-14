# Security baseline

- Cookies and sessions are handled by Better Auth.
- Organization authorization is checked separately from authentication.
- Secrets live only in server environment variables.
- Tenant-scoped operations derive the active organization from the authenticated server session rather than trusting a client-supplied organization ID.
- Paid feature access is derived from local subscription state synchronized by verified provider webhooks.
- Invitations require verified ownership of the invited email.
- Audit logs must not record access tokens, passwords, raw session tokens, webhook secrets or provider API keys.
- Rate limiting and abuse protection remain required before public launch.

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
- Monthly AI request limits are enforced on the server before the model provider is called.

## Required pre-launch review

- auth/session configuration
- CSRF and origin policy
- OAuth redirect allow-list
- invitation takeover cases
- tenant isolation tests
- Stripe test-mode Checkout and Customer Portal smoke test
- real signed webhook delivery and replay tests
- duplicate and out-of-order subscription event tests
- AI request race/concurrency behavior near quota limits
- AI prompt/file authorization boundaries
- storage signed URL expiry
- rate limiting and abuse controls
