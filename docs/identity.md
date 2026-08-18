# Identity and workspaces

AI SaaS Factory uses Better Auth for email/password identity and organization membership. Email/password remains enabled by default; the GitHub OAuth example is optional and fail-closed.

## GitHub OAuth example

Set both variables in the web runtime:

```env
GITHUB_OAUTH_CLIENT_ID=...
GITHUB_OAUTH_CLIENT_SECRET=...
```

If both are empty, GitHub sign-in is not registered on the server and the UI does not render a GitHub button. If only one is set, startup fails instead of silently creating a partially configured provider.

For local development, configure the GitHub OAuth callback as:

```text
http://localhost:3000/api/auth/callback/github
```

Use the equivalent HTTPS callback for production. The client secret stays server-side; only a boolean `githubEnabled` flag crosses into the client component.

## Workspace member management

Owners and admins can invite teammates and manage member roles from `/settings/team`. Better Auth remains the authorization boundary for the mutation endpoints.

Additional invariants are enforced in organization hooks:

- a workspace must always keep at least one owner;
- admins cannot change an owner or grant the owner role because Better Auth's default organization access-control policy reserves owner changes for owners;
- members cannot manage other members;
- member removal and role changes remain organization scoped by the authenticated active organization;
- successful mutations flow through the existing audit hooks.

The UI mirrors these rules to avoid presenting actions that the server will reject, but the server hooks remain authoritative.

## Email verification

Email/password sign-up still requires verification. GitHub OAuth follows the provider identity flow and redirects new users to `/onboarding` so they can create or select a workspace.
