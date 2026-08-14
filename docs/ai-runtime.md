# AI runtime

V0.4A turns the initial AI demo endpoint into an organization-scoped product layer with persisted conversations, model policy, quotas and generation metering.

## Configuration

```env
OPENAI_API_KEY=sk-...
AI_DEFAULT_MODEL_ID=openai:gpt-5-mini
AI_ALLOWED_MODEL_IDS=openai:gpt-5-mini
AI_RATE_LIMIT_REQUESTS_PER_MINUTE=20
AI_MODEL_PRICING_JSON={}
```

`AI_ALLOWED_MODEL_IDS` is a comma-separated allow-list. Model IDs use the stable `provider:model` format. The current edition registers OpenAI; additional providers can be added to `apps/web/lib/ai-models.ts` without rewriting conversation or metering code.

Pricing is deployment data rather than source-code data. Configure it as JSON:

```json
{
  "openai:example-model": {
    "inputUsdPerMillion": 1.25,
    "outputUsdPerMillion": 10
  }
}
```

If a model has no pricing entry, its generation is still persisted with provider-reported token counts and `estimatedCostMicros = null`.

## Request flow

`POST /api/ai/chat` accepts only:

```json
{
  "conversationId": "optional",
  "message": "user text",
  "modelId": "optional provider:model"
}
```

The browser does **not** send trusted conversation history. The server:

1. authenticates the session and resolves its active organization;
2. loads an existing conversation using both conversation ID and organization ID, or creates a new one;
3. resolves an allowed model from the server registry;
4. validates model-pricing configuration before consuming quota;
5. resolves the workspace's effective billing plan;
6. atomically reserves one AI request against monthly and one-minute limits;
7. persists the user message;
8. reloads the conversation history from PostgreSQL;
9. streams the model response;
10. persists the assistant response, token usage, finish reason, duration and optional estimated cost.

The response uses a plain UTF-8 text stream and returns `X-Conversation-Id` and `X-AI-Model-Id` headers.

## Tenant isolation

`conversation`, `conversation_message` and `ai_generation` all carry an `organization_id`.

Conversation reads, archives and deletes always scope by both the resource ID and the active organization ID. A valid conversation ID from another workspace therefore behaves like a missing resource.

The AI route reconstructs model history from tenant-scoped database rows instead of trusting client-provided history. This prevents a caller from injecting messages from another tenant into the model context.

## Quotas and rate limiting

Monthly AI requests remain a plan entitlement. V0.4A adds a configurable per-minute organization limit.

Quota reservation runs inside a PostgreSQL transaction and acquires a transaction-scoped advisory lock derived from the organization ID. Monthly and one-minute usage are counted while that lock is held, and the new `ai.requests` usage event is inserted before the lock is released.

This serializes concurrent reservations for the same organization, preventing a burst of parallel requests from all observing the same remaining quota.

## Metering

Every completed generation produces an immutable `ai_generation` row containing:

- organization and conversation;
- request and response message IDs;
- provider and stable model ID;
- finish reason;
- input, output and total tokens when reported by the provider;
- estimated micro-USD cost when pricing is configured;
- generation duration.

Additional immutable `usage_event` rows record input tokens, output tokens and estimated cost using generation-derived idempotency keys.

For pricing expressed in USD per one million tokens, micro-USD cost simplifies to:

```text
inputTokens × inputUsdPerMillion + outputTokens × outputUsdPerMillion
```

The result is rounded to the nearest micro-USD.

## Streaming and disconnects

The HTTP client receives a normal text stream. The server also calls the AI SDK result's `consumeStream()` without awaiting it. This removes client backpressure as the only consumer and allows the generation lifecycle, including `onFinish`, to complete even when the browser disconnects.

A production deployment should still add explicit generation states/resumable streams if seamless recovery of in-flight UI is required.

## Conversation lifecycle

- `/ai` starts a new conversation and lists active conversations.
- `/ai/[id]` loads persisted history.
- archive makes a conversation read-only until restored.
- delete permanently removes the conversation; database cascades remove messages and generation records.

## Migration

V0.4A adds the Drizzle-generated migration:

```text
packages/db/drizzle/0001_ai_runtime.sql
```

Apply committed migrations with:

```bash
pnpm db:migrate
```

CI validates the migration journal with `drizzle-kit check` before lint, typecheck, tests and build.

## Pre-launch checks

- run a real provider smoke test with a non-production API key;
- verify token usage fields for every enabled model/provider;
- verify configured pricing against the provider's current pricing before launch;
- load-test quota reservation near monthly and per-minute boundaries;
- add explicit retention/export policy for conversations;
- add provider-specific content safety controls where required by the target product.
