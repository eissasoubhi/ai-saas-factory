# Browser E2E testing

The browser suite lives in `apps/e2e` and uses Playwright with Chromium. It is intentionally separate from the normal `pnpm test` unit-test task.

## Local run

Start PostgreSQL using the same schema requirements as the application, then configure at least:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_saas_factory_test
BETTER_AUTH_SECRET=local-e2e-secret-at-least-32-characters
BETTER_AUTH_URL=http://127.0.0.1:3000
```

Apply migrations, install Chromium once, then run the browser suite:

```text
pnpm db:migrate
pnpm --filter @factory/e2e exec playwright install chromium
pnpm e2e
```

Outside CI the Playwright config starts the web app in development mode and reuses an existing server when one is already running.

## CI design

The E2E job runs independently on `ubuntu-latest` with an ephemeral PostgreSQL service using the pgvector image required by the RAG migration. It:

1. installs the frozen pnpm workspace;
2. installs Chromium and its Linux dependencies;
3. applies the committed Drizzle migrations;
4. builds the web application;
5. starts the production Next.js server through Playwright `webServer`;
6. runs the Chromium suite with one worker and deterministic retries;
7. uploads traces, screenshots and the HTML report only when the job fails.

The authenticated scenario creates a normal email/password user through the browser. Because production requires email verification, the E2E fixture marks only that ephemeral test user's database row as verified before signing in. No test-only HTTP authentication bypass exists in the product runtime.

## Current browser coverage

- `/api/health` response and public navigation smoke;
- sign-up/sign-in browser validation;
- real Better Auth email/password sign-up;
- verified sign-in;
- workspace creation through Better Auth organization APIs;
- authenticated dashboard rendering.

External OAuth, Resend and Stripe are deliberately not required for this deterministic browser suite; their integration smokes remain separate pre-launch checks.
