# Security baseline

- Cookies/sessions are handled by Better Auth.
- Organization authorization is checked separately from authentication.
- Secrets live only in server environment variables.
- AI and billing routes must use server-side entitlement checks.
- Billing webhooks will verify signatures and persist idempotency keys before applying side effects.
- Invitations should require verified ownership of the invited email.
- Rate limiting and abuse protection are V0.3 deliverables before public launch.
- Audit logs must not record access tokens, passwords, raw session tokens or provider secrets.

## Required pre-launch review

- auth/session configuration
- CSRF and origin policy
- OAuth redirect allow-list
- invitation takeover cases
- tenant isolation tests
- billing webhook replay tests
- AI prompt/file authorization boundaries
- storage signed URL expiry
