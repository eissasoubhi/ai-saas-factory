import {
  consumeAiRequestQuota,
  createConversation,
  createConversationMessage,
  getConversationForOrganization,
  getSubscriptionForOrganization,
  listConversationMessages,
  paidPlanForSubscription,
  recordAiGeneration,
  recordUsage,
} from '@factory/db';
import { entitlement } from '@factory/entitlements';
import { streamText, type ModelMessage } from 'ai';
import { estimateAiCostMicros } from '@/lib/ai-pricing';
import { resolveAiModel } from '@/lib/ai-models';
import { auth } from '@/lib/auth';

export const maxDuration = 60;
export const runtime = 'nodejs';

function rateLimitPerMinute() {
  const parsed = Number(process.env.AI_RATE_LIMIT_REQUESTS_PER_MINUTE ?? '20');
  if (!Number.isFinite(parsed)) return 20;
  return Math.min(Math.max(Math.floor(parsed), 1), 1_000);
}

function conversationTitle(message: string) {
  const compact = message.replace(/\s+/g, ' ').trim();
  return compact.length <= 80 ? compact : `${compact.slice(0, 77)}...`;
}

function toModelMessages(messages: Awaited<ReturnType<typeof listConversationMessages>>): ModelMessage[] {
  const result: ModelMessage[] = [];
  for (const message of messages) {
    if (message.role === 'user') result.push({ role: 'user', content: message.content });
    if (message.role === 'assistant') result.push({ role: 'assistant', content: message.content });
  }
  return result;
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  const organizationId = session?.session.activeOrganizationId;
  if (!session || !organizationId) {
    return Response.json({ error: 'Authentication and an active workspace are required.' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    conversationId?: string;
    message?: string;
    modelId?: string;
  } | null;
  const message = body?.message?.trim();
  if (!message) return Response.json({ error: 'message is required.' }, { status: 400 });
  if (message.length > 20_000) return Response.json({ error: 'message is too long.' }, { status: 413 });

  let existingConversation = body?.conversationId
    ? await getConversationForOrganization(organizationId, body.conversationId)
    : null;
  if (body?.conversationId && !existingConversation) {
    return Response.json({ error: 'Conversation not found.' }, { status: 404 });
  }
  if (existingConversation?.archivedAt) {
    return Response.json({ error: 'Archived conversations are read-only until restored.' }, { status: 409 });
  }

  let resolvedModel: ReturnType<typeof resolveAiModel>;
  try {
    resolvedModel = resolveAiModel(existingConversation?.modelId ?? body?.modelId);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Invalid AI model.' }, { status: 400 });
  }
  if (resolvedModel.provider === 'openai' && !process.env.OPENAI_API_KEY) {
    return Response.json({ error: 'OPENAI_API_KEY is not configured.' }, { status: 503 });
  }

  const snapshot = await getSubscriptionForOrganization(organizationId);
  const plan = paidPlanForSubscription(snapshot);
  const monthlyLimit = entitlement(plan, 'ai_requests_monthly') as number;
  const requestId = crypto.randomUUID();
  const quota = await consumeAiRequestQuota({
    organizationId,
    actorUserId: session.user.id,
    monthlyLimit,
    perMinuteLimit: rateLimitPerMinute(),
    idempotencyKey: `ai-request/${organizationId}/${requestId}`,
    metadata: { plan, modelId: resolvedModel.modelId },
  });
  if (!quota.allowed) {
    const error = quota.reason === 'monthly_limit'
      ? `Monthly AI request limit reached for the ${plan} plan.`
      : 'Too many AI requests. Try again in a moment.';
    return Response.json(
      { error, reason: quota.reason, monthlyUsed: quota.monthlyUsed, minuteUsed: quota.minuteUsed },
      { status: 429 },
    );
  }

  if (!existingConversation) {
    existingConversation = await createConversation({
      organizationId,
      createdByUserId: session.user.id,
      title: conversationTitle(message),
      modelId: resolvedModel.modelId,
    });
  }

  const userMessage = await createConversationMessage({
    organizationId,
    conversationId: existingConversation.id,
    role: 'user',
    content: message,
    modelId: resolvedModel.modelId,
  });
  const persistedMessages = await listConversationMessages(organizationId, existingConversation.id);
  const startedAt = Date.now();

  const result = streamText({
    model: resolvedModel.model,
    system: 'You are a concise, helpful assistant inside a B2B SaaS application.',
    messages: toModelMessages(persistedMessages),
    async onFinish({ text, finishReason, totalUsage, response }) {
      if (!text.trim()) return;

      const inputTokens = totalUsage.inputTokens ?? null;
      const outputTokens = totalUsage.outputTokens ?? null;
      const totalTokens = totalUsage.totalTokens ?? null;
      const assistantMessage = await createConversationMessage({
        organizationId,
        conversationId: existingConversation.id,
        role: 'assistant',
        content: text,
        modelId: resolvedModel.modelId,
        providerMessageId: response.id,
      });
      const estimatedCostMicros = estimateAiCostMicros({
        modelId: resolvedModel.modelId,
        inputTokens,
        outputTokens,
      });
      const generation = await recordAiGeneration({
        organizationId,
        conversationId: existingConversation.id,
        requestMessageId: userMessage.id,
        responseMessageId: assistantMessage.id,
        provider: resolvedModel.provider,
        modelId: resolvedModel.modelId,
        finishReason,
        inputTokens,
        outputTokens,
        totalTokens,
        estimatedCostMicros,
        durationMs: Date.now() - startedAt,
      });

      const usageWrites: Promise<unknown>[] = [];
      if (inputTokens != null) {
        usageWrites.push(recordUsage({
          organizationId,
          actorUserId: session.user.id,
          metric: 'ai.input_tokens',
          quantity: inputTokens,
          idempotencyKey: `ai-input-tokens/${generation.id}`,
          metadata: { modelId: resolvedModel.modelId },
        }));
      }
      if (outputTokens != null) {
        usageWrites.push(recordUsage({
          organizationId,
          actorUserId: session.user.id,
          metric: 'ai.output_tokens',
          quantity: outputTokens,
          idempotencyKey: `ai-output-tokens/${generation.id}`,
          metadata: { modelId: resolvedModel.modelId },
        }));
      }
      if (estimatedCostMicros != null) {
        usageWrites.push(recordUsage({
          organizationId,
          actorUserId: session.user.id,
          metric: 'ai.cost_micros',
          quantity: estimatedCostMicros,
          idempotencyKey: `ai-cost/${generation.id}`,
          metadata: { modelId: resolvedModel.modelId },
        }));
      }
      await Promise.all(usageWrites);
    },
  });

  void result.consumeStream({ onError: (error) => console.error('AI stream consumption failed', error) });
  return result.toTextStreamResponse({
    headers: {
      'X-Conversation-Id': existingConversation.id,
      'X-AI-Model-Id': resolvedModel.modelId,
    },
  });
}