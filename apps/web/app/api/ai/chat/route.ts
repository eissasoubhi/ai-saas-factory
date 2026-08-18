import {
  assertOrganizationScope,
  consumeAiRequestQuota,
  createConversation,
  createConversationMessage,
  ensureMonthlyPlanCreditGrant,
  getConversationForOrganization,
  getSubscriptionForOrganization,
  listConversationMessages,
  paidPlanForSubscription,
  recordAiGeneration,
  recordUsage,
  releaseUsageCreditReservation,
  reserveUsageCredits,
  searchDocumentChunks,
  settleUsageCreditReservation,
} from '@factory/db';
import { embedQuery } from '@factory/embeddings';
import { aiCreditPolicy, entitlement } from '@factory/entitlements';
import { correlationIdFromHeaders, emitTelemetry } from '@factory/telemetry';
import { streamText, type ModelMessage } from 'ai';
import { estimateAiCostMicros, parseModelPricingJson } from '@/lib/ai-pricing';
import { resolveAiModel } from '@/lib/ai-models';
import { recordAuditEvent } from '@/lib/audit';
import { auth } from '@/lib/auth';
import { publishOutboundWebhookEvent } from '@/lib/outbound-events';
import {
  buildRagSystemContext,
  encodeRagSourcesHeader,
  ragRetrievalConfig,
  ragSources,
} from '@/lib/rag-context';

export const maxDuration = 60;
export const runtime = 'nodejs';

function rateLimitPerMinute() {
  const parsed = Number(process.env.AI_RATE_LIMIT_REQUESTS_PER_MINUTE ?? '20');
  if (!Number.isFinite(parsed)) return 20;
  return Math.min(Math.max(Math.floor(parsed), 1), 1_000);
}

function creditReservationMicros() {
  const parsed = Number(process.env.AI_CREDIT_RESERVATION_MICROS ?? '100000');
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return 100_000;
  return Math.min(Math.max(parsed, 1_000), 100_000_000);
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
  const correlationId = correlationIdFromHeaders(request.headers);
  const requestStartedAt = Date.now();
  const session = await auth.api.getSession({ headers: request.headers });
  const organizationId = session?.session.activeOrganizationId;
  if (!session || !organizationId) {
    return Response.json({ error: 'Authentication and an active workspace are required.' }, { status: 401 });
  }
  const actorUserId = session.user.id;
  const activeOrganizationId = organizationId;

  const body = (await request.json().catch(() => null)) as {
    conversationId?: string;
    message?: string;
    modelId?: string;
    useKnowledge?: boolean;
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

  let pricing: ReturnType<typeof parseModelPricingJson>;
  try {
    pricing = parseModelPricingJson(process.env.AI_MODEL_PRICING_JSON);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Invalid AI pricing configuration.' },
      { status: 503 },
    );
  }

  const snapshot = await getSubscriptionForOrganization(organizationId);
  const plan = paidPlanForSubscription(snapshot);
  const monthlyLimit = entitlement(plan, 'ai_requests_monthly') as number;
  const creditPolicy = aiCreditPolicy(plan);
  const reservationMicros = creditReservationMicros();
  const requestId = crypto.randomUUID();

  await ensureMonthlyPlanCreditGrant({
    organizationId,
    plan,
    includedMicros: creditPolicy.includedMicros,
  });
  const creditReservation = await reserveUsageCredits({
    organizationId,
    actorUserId: session.user.id,
    requestId,
    reservationMicros,
    overageAllowed: creditPolicy.overageAllowed,
  });
  if (!creditReservation.allowed) {
    emitTelemetry({
      name: 'web.ai.credit_rejected',
      level: 'warn',
      component: 'web',
      correlationId,
      durationMs: Date.now() - requestStartedAt,
      organizationId,
      userId: session.user.id,
      attributes: {
        requestId,
        plan,
        modelId: resolvedModel.modelId,
        balanceBeforeMicros: creditReservation.balanceBeforeMicros,
        reservationMicros,
      },
    });
    return Response.json(
      {
        error: `Monthly AI credit allowance reached for the ${plan} plan.`,
        reason: creditReservation.reason,
        balanceMicros: creditReservation.balanceBeforeMicros,
      },
      { status: 402 },
    );
  }

  async function releaseReservation(reason: string) {
    try {
      await releaseUsageCreditReservation({
        organizationId: activeOrganizationId,
        actorUserId,
        requestId,
        reservationMicros,
      });
      emitTelemetry({
        name: 'web.ai.credit_reservation_released',
        component: 'web',
        correlationId,
        organizationId: activeOrganizationId,
        userId: actorUserId,
        attributes: { requestId, plan, modelId: resolvedModel.modelId, reservationMicros, reason },
      });
    } catch (error) {
      emitTelemetry({
        name: 'web.ai.credit_release_failed',
        level: 'error',
        component: 'web',
        correlationId,
        organizationId: activeOrganizationId,
        userId: actorUserId,
        attributes: { requestId, plan, modelId: resolvedModel.modelId, reservationMicros, reason },
        error,
      });
    }
  }

  const quota = await consumeAiRequestQuota({
    organizationId,
    actorUserId: session.user.id,
    monthlyLimit,
    perMinuteLimit: rateLimitPerMinute(),
    idempotencyKey: `ai-request/${organizationId}/${requestId}`,
    metadata: { plan, modelId: resolvedModel.modelId, useKnowledge: body?.useKnowledge === true },
  });
  if (!quota.allowed) {
    await releaseReservation('quota_rejected');
    emitTelemetry({
      name: 'web.ai.quota_rejected',
      level: 'warn',
      component: 'web',
      correlationId,
      durationMs: Date.now() - requestStartedAt,
      organizationId,
      userId: session.user.id,
      attributes: {
        reason: quota.reason,
        plan,
        modelId: resolvedModel.modelId,
        monthlyUsed: quota.monthlyUsed,
        minuteUsed: quota.minuteUsed,
      },
    });
    const error = quota.reason === 'monthly_limit'
      ? `Monthly AI request limit reached for the ${plan} plan.`
      : 'Too many AI requests. Try again in a moment.';
    return Response.json(
      { error, reason: quota.reason, monthlyUsed: quota.monthlyUsed, minuteUsed: quota.minuteUsed },
      { status: 429 },
    );
  }

  let retrievedChunks: Awaited<ReturnType<typeof searchDocumentChunks>> = [];
  if (body?.useKnowledge === true) {
    try {
      const query = await embedQuery(message);
      const retrieval = ragRetrievalConfig();
      retrievedChunks = await searchDocumentChunks({
        organizationId,
        embedding: query.embedding,
        limit: retrieval.limit,
        minSimilarity: retrieval.minSimilarity,
      });
      if (query.tokens > 0) {
        await recordUsage({
          organizationId,
          actorUserId: session.user.id,
          metric: 'ai.embedding_tokens',
          quantity: query.tokens,
          idempotencyKey: `rag-query-embedding/${requestId}`,
          metadata: { modelId: query.modelId, retrievedChunks: retrievedChunks.length },
        });
      }
    } catch (error) {
      await releaseReservation('retrieval_failed');
      emitTelemetry({
        name: 'web.ai.retrieval_failed',
        level: 'error',
        component: 'web',
        correlationId,
        durationMs: Date.now() - requestStartedAt,
        organizationId,
        userId: session.user.id,
        attributes: { modelId: resolvedModel.modelId, useKnowledge: true },
        error,
      });
      return Response.json(
        { error: error instanceof Error ? error.message : 'Knowledge retrieval is unavailable.' },
        { status: 503 },
      );
    }
  }

  let userMessage: Awaited<ReturnType<typeof createConversationMessage>>;
  try {
    if (!existingConversation) {
      existingConversation = await createConversation({
        organizationId,
        createdByUserId: session.user.id,
        title: conversationTitle(message),
        modelId: resolvedModel.modelId,
      });
    }

    userMessage = await createConversationMessage({
      organizationId,
      conversationId: existingConversation.id,
      role: 'user',
      content: message,
      modelId: resolvedModel.modelId,
    });
  } catch (error) {
    await releaseReservation('conversation_persistence_failed');
    emitTelemetry({
      name: 'web.ai.persistence_failed',
      level: 'error',
      component: 'web',
      correlationId,
      durationMs: Date.now() - requestStartedAt,
      organizationId,
      userId: session.user.id,
      attributes: { requestId, modelId: resolvedModel.modelId },
      error,
    });
    return Response.json({ error: 'Unable to persist the conversation.' }, { status: 503 });
  }

  const persistedMessages = await listConversationMessages(organizationId, existingConversation.id);
  assertOrganizationScope(organizationId, persistedMessages);
  const generationStartedAt = Date.now();
  const system =
    'You are a concise, helpful assistant inside a B2B SaaS application.' +
    buildRagSystemContext(retrievedChunks);

  const result = streamText({
    model: resolvedModel.model,
    system,
    messages: toModelMessages(persistedMessages),
    async onFinish({ text, finishReason, totalUsage, response }) {
      if (!text.trim()) {
        await releaseReservation('empty_generation');
        return;
      }

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
        pricing,
      });
      const durationMs = Date.now() - generationStartedAt;
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
        durationMs,
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

      try {
        await settleUsageCreditReservation({
          organizationId,
          actorUserId: session.user.id,
          requestId,
          reservationMicros,
          actualCostMicros: estimatedCostMicros ?? 0,
        });
      } catch (error) {
        emitTelemetry({
          name: 'web.ai.credit_settlement_failed',
          level: 'error',
          component: 'web',
          correlationId,
          organizationId,
          userId: session.user.id,
          attributes: {
            requestId,
            generationId: generation.id,
            reservationMicros,
            actualCostMicros: estimatedCostMicros,
          },
          error,
        });
      }

      await recordAuditEvent({
        organizationId,
        actorUserId: session.user.id,
        action: 'ai.generation.completed',
        entityType: 'ai_generation',
        entityId: generation.id,
        correlationId,
        metadata: {
          conversationId: existingConversation.id,
          provider: resolvedModel.provider,
          modelId: resolvedModel.modelId,
          finishReason,
          inputTokens,
          outputTokens,
          totalTokens,
          estimatedCostMicros,
          durationMs,
          useKnowledge: body?.useKnowledge === true,
          retrievedChunks: retrievedChunks.length,
          creditReservationMicros: reservationMicros,
          creditOverageAllowed: creditPolicy.overageAllowed,
        },
      });
      emitTelemetry({
        name: 'web.ai.generation_completed',
        component: 'web',
        correlationId,
        durationMs,
        organizationId,
        userId: session.user.id,
        attributes: {
          requestId,
          generationId: generation.id,
          conversationId: existingConversation.id,
          provider: resolvedModel.provider,
          modelId: resolvedModel.modelId,
          finishReason,
          inputTokens,
          outputTokens,
          totalTokens,
          estimatedCostMicros,
          useKnowledge: body?.useKnowledge === true,
          retrievedChunks: retrievedChunks.length,
          creditReservationMicros: reservationMicros,
          creditOverageAllowed: creditPolicy.overageAllowed,
        },
      });

      try {
        await publishOutboundWebhookEvent({
          organizationId,
          type: 'ai.generation.completed',
          eventId: `evt_ai_generation_${generation.id}`,
          correlationId,
          data: {
            generationId: generation.id,
            conversationId: existingConversation.id,
            provider: resolvedModel.provider,
            modelId: resolvedModel.modelId,
            finishReason,
            inputTokens,
            outputTokens,
            totalTokens,
            estimatedCostMicros,
            durationMs,
            useKnowledge: body?.useKnowledge === true,
            retrievedChunks: retrievedChunks.length,
          },
        });
      } catch (error) {
        emitTelemetry({
          name: 'web.outbound_webhook.publish_failed',
          level: 'error',
          component: 'web',
          correlationId,
          organizationId,
          userId: session.user.id,
          attributes: { eventId: `evt_ai_generation_${generation.id}`, eventType: 'ai.generation.completed' },
          error,
        });
      }
    },
  });

  void result.consumeStream({
    onError: (error) => {
      void releaseReservation('stream_failed');
      emitTelemetry({
        name: 'web.ai.stream_failed',
        level: 'error',
        component: 'web',
        correlationId,
        durationMs: Date.now() - requestStartedAt,
        organizationId,
        userId: session.user.id,
        attributes: {
          requestId,
          conversationId: existingConversation.id,
          provider: resolvedModel.provider,
          modelId: resolvedModel.modelId,
          useKnowledge: body?.useKnowledge === true,
        },
        error,
      });
    },
  });
  return result.toTextStreamResponse({
    headers: {
      'X-Request-Id': correlationId,
      'X-Conversation-Id': existingConversation.id,
      'X-AI-Model-Id': resolvedModel.modelId,
      'X-RAG-Sources': encodeRagSourcesHeader(ragSources(retrievedChunks)),
    },
  });
}
