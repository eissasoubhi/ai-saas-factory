# Changelog

All notable customer-facing changes to AI SaaS Factory will be documented in this file.

The project follows semantic versioning for commercial releases. See `docs/versioning.md`.

## Unreleased

### Added

- GitHub-hosted quality and authenticated Playwright browser E2E validation.
- Optional GitHub OAuth and expanded workspace member management.
- Organization API keys and signed outbound customer webhooks.
- Tenant-scoped audit/usage observability and structured redacted telemetry.
- Usage-credit ledger, plan allowances, reservation/settlement and customer-facing balance.
- Commercial bootstrap, deployment and release-readiness documentation.

### Security

- Last-owner continuity protection for workspace administration.
- Public-HTTPS/DNS SSRF protections for outbound customer webhooks.
- One-time API-key/webhook-secret reveal and encrypted webhook secrets at rest.

## 0.1.0 - Development baseline

Initial monorepo foundation for the pre-launch starter kit.
