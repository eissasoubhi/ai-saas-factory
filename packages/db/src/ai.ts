import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, gte, isNull, sql, sum } from 'drizzle-orm';
import { database } from './index';
import {
  aiGeneration,
  conversation,
  conversationMessage,
  usageEvent,
} from './schema';

export type ConversationRole = 'user' | 'assistant';

export type AiQuotaResult =
  | { allowed: true; monthlyUsed: number; minuteUsed: number }
  | {
      allowed: false;
      reason: 'monthly_limit' | 'rate_limit';
      monthlyUsed: number;
      minuteUsed: number;
    };

export async function createConversation(input: {
  organizationId: string;
  createdByUserId: string;
  title: string;
  modelId: string;
}) {
  const db = database();
  const [row] = await db
    .insert(conversation)
    .values({
      id: randomUUID(),
      organizationId: input.organizationId,
      createdByUserId: input.createdByUserId,
      title: input.title,
      modelId: input.modelId,
    })
    .returning();
  if (!row) throw new Error('Unable to create conversation');
  return row;
}

export async function getConversationForOrganization(organizationId: string, conversationId: string) {
  const db = database();
  const [row] = await db
    .select()
    .from(conversation)
    .where(and(eq(conversation.id, conversationId), eq(conversation.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

export async function listConversationsForOrganization(
  organizationId: string,
  options: { includeArchived?: boolean; limit?: number } = {},
) {
  const db = database();
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const conditions = [eq(conversation.organizationId, organizationId)];
  if (!options.includeArchived) conditions.push(isNull(conversation.archivedAt));

  return db
    .select()
    .from(conversation)
    .where(and(...conditions))
    .orderBy(desc(conversation.updatedAt))
    .limit(limit);
}

export async function setConversationArchived(input: {
  organizationId: string;
  conversationId: string;
  archived: boolean;
}) {
  const db = database();
  const [row] = await db
    .update(conversation)
    .set({ archivedAt: input.archived ? new Date() : null, updatedAt: new Date() })
    .where(
      and(
        eq(conversation.id, input.conversationId),
        eq(conversation.organizationId, input.organizationId),
      ),
    )
    .returning();
  return row ?? null;
}

export async function deleteConversationForOrganization(organizationId: string, conversationId: string) {
  const db = database();
  const [row] = await db
    .delete(conversation)
    .where(and(eq(conversation.id, conversationId), eq(conversation.organizationId, organizationId)))
    .returning({ id: conversation.id });
  return row ?? null;
}

export async function listConversationMessages(organizationId: string, conversationId: string) {
  const db = database();
  return db
    .select()
    .from(conversationMessage)
    .where(
      and(
        eq(conversationMessage.organizationId, organizationId),
        eq(conversationMessage.conversationId, conversationId),
      ),
    )
    .orderBy(asc(conversationMessage.createdAt));
}

export async function createConversationMessage(input: {
  organizationId: string;
  conversationId: string;
  role: ConversationRole;
  content: string;
  modelId?: string | null;
  providerMessageId?: string | null;
}) {
  const db = database();
  const [row] = await db
    .insert(conversationMessage)
    .values({
      id: randomUUID(),
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      role: input.role,
      content: input.content,
      modelId: input.modelId ?? null,
      providerMessageId: input.providerMessageId ?? null,
    })
    .returning();
  if (!row) throw new Error('Unable to persist conversation message');

  await db
    .update(conversation)
    .set({ updatedAt: new Date() })
    .where(
      and(
        eq(conversation.id, input.conversationId),
        eq(conversation.organizationId, input.organizationId),
      ),
    );
  return row;
}

export async function recordAiGeneration(input: {
  organizationId: string;
  conversationId: string;
  requestMessageId?: string | null;
  responseMessageId?: string | null;
  provider: string;
  modelId: string;
  finishReason?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  estimatedCostMicros?: number | null;
  durationMs?: number | null;
}) {
  const db = database();
  const [row] = await db
    .insert(aiGeneration)
    .values({
      id: randomUUID(),
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      requestMessageId: input.requestMessageId ?? null,
      responseMessageId: input.responseMessageId ?? null,
      provider: input.provider,
      modelId: input.modelId,
      finishReason: input.finishReason ?? null,
      inputTokens: input.inputTokens ?? null,
      outputTokens: input.outputTokens ?? null,
      totalTokens: input.totalTokens ?? null,
      estimatedCostMicros: input.estimatedCostMicros ?? null,
      durationMs: input.durationMs ?? null,
    })
    .returning();
  if (!row) throw new Error('Unable to record AI generation');
  return row;
}

export async function consumeAiRequestQuota(input: {
  organizationId: string;
  actorUserId: string;
  monthlyLimit: number;
  perMinuteLimit: number;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
  now?: Date;
}): Promise<AiQuotaResult> {
  const db = database();
  const now = input.now ?? new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const minuteStart = new Date(now.getTime() - 60_000);

  return db.transaction(async (tx) => {
    const lockKey = `ai-quota:${input.organizationId}`;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);

    const [[monthlyRow], [minuteRow]] = await Promise.all([
      tx
        .select({ value: sum(usageEvent.quantity) })
        .from(usageEvent)
        .where(
          and(
            eq(usageEvent.organizationId, input.organizationId),
            eq(usageEvent.metric, 'ai.requests'),
            gte(usageEvent.createdAt, monthStart),
          ),
        ),
      tx
        .select({ value: sum(usageEvent.quantity) })
        .from(usageEvent)
        .where(
          and(
            eq(usageEvent.organizationId, input.organizationId),
            eq(usageEvent.metric, 'ai.requests'),
            gte(usageEvent.createdAt, minuteStart),
          ),
        ),
    ]);

    const monthlyUsed = Number(monthlyRow?.value ?? 0);
    const minuteUsed = Number(minuteRow?.value ?? 0);
    if (monthlyUsed >= input.monthlyLimit) {
      return { allowed: false, reason: 'monthly_limit', monthlyUsed, minuteUsed };
    }
    if (minuteUsed >= input.perMinuteLimit) {
      return { allowed: false, reason: 'rate_limit', monthlyUsed, minuteUsed };
    }

    const [inserted] = await tx
      .insert(usageEvent)
      .values({
        id: randomUUID(),
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        metric: 'ai.requests',
        quantity: 1,
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata,
        createdAt: now,
      })
      .onConflictDoNothing({ target: usageEvent.idempotencyKey })
      .returning({ id: usageEvent.id });

    if (!inserted) {
      return { allowed: false, reason: 'rate_limit', monthlyUsed, minuteUsed };
    }

    return { allowed: true, monthlyUsed: monthlyUsed + 1, minuteUsed: minuteUsed + 1 };
  });
}
