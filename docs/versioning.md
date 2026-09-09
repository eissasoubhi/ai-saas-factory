# Versioning and changelog policy

AI SaaS Factory uses semantic versioning once customer releases begin.

- **PATCH**: backwards-compatible fixes, documentation corrections and internal hardening that do not require customer code changes.
- **MINOR**: backwards-compatible features, new optional integrations, additive schema/API capabilities and new starter-kit modules.
- **MAJOR**: intentionally breaking public API, configuration, generated-project or migration expectations.

Pre-1.0 releases may still evolve quickly, but breaking changes must be called out explicitly in `CHANGELOG.md` and release notes.

## Release source of truth

A release is identified by an annotated Git tag on a commit that has passed the repository's GitHub-hosted `quality` and `browser-e2e` checks. Do not tag an unvalidated local commit.

## Changelog

`CHANGELOG.md` follows a Keep-a-Changelog-style structure with `Added`, `Changed`, `Fixed`, `Security`, `Deprecated` and `Removed` sections where relevant.

Every customer-visible change belongs in the changelog. Pure refactors may be omitted unless they materially change upgrade or operating behavior.

## Database compatibility

Additive migrations should be preferred. Breaking schema changes use an expand/migrate/contract sequence across releases. Release notes must identify migrations that prevent a safe application-code rollback.

## Provider/API compatibility

Provider API versions are explicit configuration/code decisions. A provider version bump that can alter billing, auth or persisted data behavior must be described in the changelog even when the public application API stays unchanged.
