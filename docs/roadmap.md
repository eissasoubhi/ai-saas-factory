# Roadmap

## V0.1 — foundation

- [x] Turborepo + pnpm workspace
- [x] Next.js web shell
- [x] Expo mobile shell
- [x] PostgreSQL/Drizzle package
- [x] Better Auth server wiring
- [x] organization-capable auth schema
- [x] entitlement policy package
- [x] AI streaming route skeleton
- [x] audit/usage/billing data model
- [x] Docker local services
- [x] CI workflow
- [x] architecture/product/security docs

## V0.2 — identity and workspaces

- [x] email/password sign up, sign in and sign out
- [x] email verification and password reset
- [x] protected dashboard
- [x] first-run workspace onboarding
- [x] organization creation and active-organization handling
- [x] invitations and member settings
- [x] owner/admin/member authorization through Better Auth
- [x] Resend transactional email adapter
- [x] ARM64 self-hosted CI support
- [ ] OAuth provider example
- [ ] browser E2E suite
- [ ] expanded member management actions

## V0.3 — billing and entitlements

- [x] organization-scoped Stripe Checkout
- [x] Stripe Customer Portal
- [x] verified webhook signatures with replay protection
- [x] idempotent webhook event claims and retries
- [x] out-of-order subscription event protection
- [x] customer/subscription/price mapping per workspace
- [x] paid plan resolution from server-side subscription state
- [x] server-side team seat enforcement
- [x] monthly AI request entitlement enforcement
- [x] billing settings UI
- [x] subscription/usage audit primitives
- [x] V0.3 database migration
- [x] tests for webhook signatures and event ordering
- [ ] Stripe test-mode end-to-end smoke test with real webhook delivery

## V0.4A — AI runtime, conversations and metering

- [x] organization-scoped persisted conversations
- [x] persisted user/assistant messages
- [x] server-authoritative conversation history
- [x] centralized `provider:model` registry
- [x] deployment model allow-list
- [x] provider-reported token capture
- [x] configurable per-model cost estimation
- [x] immutable generation and usage ledger
- [x] atomic monthly AI request reservation
- [x] organization-level per-minute rate limiting
- [x] conversation list/detail UI
- [x] archive, restore and delete flows
- [x] disconnect-safe stream consumption for persistence
- [x] Drizzle AI runtime migration
- [x] pricing and quota policy tests
- [ ] real-provider smoke test with a test API key

## V0.4B1 — storage and durable jobs

- [x] S3-compatible object storage abstraction
- [x] server-generated opaque tenant object keys
- [x] short-lived presigned PUT/GET URLs
- [x] file MIME and size policy
- [x] post-upload object metadata verification
- [x] tenant-scoped file lifecycle persistence
- [x] upload / completion / download / delete APIs
- [x] workspace file management UI
- [x] pg-boss PostgreSQL queue abstraction
- [x] retry/backoff and dead-letter queue
- [x] separate durable worker runtime
- [x] tenant-scoped minimal job payload
- [x] file ingestion lifecycle (`uploading → uploaded → processing → ready/failed`)
- [x] storage/job unit tests
- [x] generated Drizzle storage migration
- [ ] real S3/R2 smoke test and browser CORS validation

## V0.4B2 — tenant-isolated RAG

- [x] pgvector migration and local PostgreSQL image
- [x] document extraction for PDF/text/Markdown/CSV/JSON
- [x] deterministic chunk persistence and replacement lifecycle
- [x] embeddings provider/runtime boundary
- [x] fixed embedding-dimension validation
- [x] batched embeddings in the durable worker
- [x] tenant-scoped exact cosine retrieval
- [x] RAG knowledge mode integrated into conversations
- [x] source markers and live source metadata
- [x] document deletion / re-index flow
- [x] extraction, chunking, prompt-boundary and embedding-config tests
- [x] defense-in-depth tenant assertion on retrieved rows
- [ ] storage and retrieval quotas
- [ ] real pgvector + S3/R2 + embedding-provider integration smoke test

## V0.4C1 — audit, usage and observability

- [x] tenant-scoped audit log viewer
- [x] bounded deterministic audit cursor pagination
- [x] audit events for organization/member, billing, file/RAG and AI generation actions
- [x] AI usage and configured-cost dashboard
- [x] daily and per-model usage breakdowns
- [x] owner/admin-only cost visibility
- [x] structured application telemetry boundary
- [x] request/correlation IDs across web and worker events
- [x] recursive redaction of secrets, auth material, prompts, document content and signed URLs
- [x] worker ingestion duration/result telemetry
- [x] pagination, aggregation and telemetry-redaction tests

## V0.4C2 — platform APIs and customer webhooks

- [ ] organization API keys
- [ ] API key hashing, scopes, rotation and revocation
- [ ] outbound customer webhook endpoints
- [ ] signed webhook deliveries
- [ ] durable delivery retries and dead-letter handling
- [ ] delivery log UI
- [ ] API/webhook tenant-isolation tests
- [ ] usage credits and overage model

## V0.5 — mobile

- [ ] auth/session flow for Expo
- [ ] organization switcher
- [ ] shared API client
- [ ] RevenueCat subscription example
- [ ] push notification foundation
- [ ] deep links
- [ ] EAS build/deploy documentation

## V0.6 — commercial launch

- [ ] polished demo application
- [ ] installation wizard / bootstrap script
- [ ] complete documentation site
- [ ] deployment guides
- [ ] customer license
- [ ] changelog/versioning policy
- [ ] sample vertical app
- [ ] launch page, screenshots and demo video
