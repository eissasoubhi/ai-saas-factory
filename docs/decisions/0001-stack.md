# ADR 0001: TypeScript-first monorepo

Status: accepted — 2026-08-13

## Decision

Use a TypeScript-first Turborepo with Next.js for web, Expo for mobile, PostgreSQL + Drizzle for persistence, Better Auth for identity/organizations and AI SDK for model integration.

## Rationale

The commercial audience for TypeScript/React/Next.js starter kits is substantially larger than the Symfony + Next.js intersection. Expo preserves React/TypeScript skill reuse for mobile. PostgreSQL keeps data ownership portable. Better Auth avoids making a hosted identity vendor mandatory for every customer.

## Consequences

- PHP/Symfony is not part of the flagship edition.
- Python is optional, not a required runtime.
- The repo must keep server-only packages isolated from mobile/browser packages.
- We accept strong competition in Next.js in exchange for a much larger buyer pool and differentiate through B2B + AI + mobile plumbing.
