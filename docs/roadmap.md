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

## V0.4 — AI product layer

- [ ] persisted conversations
- [ ] model/provider abstraction examples
- [ ] token and cost ledger
- [ ] usage credits and overage model
- [ ] rate limiting
- [ ] background jobs
- [ ] file uploads / object storage
- [ ] RAG example
- [ ] audit log viewer
- [ ] API keys and outbound customer webhooks

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
