import { randomUUID } from 'node:crypto';
import {
  and,
  count,
  eq,
  gte,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  sql,
  sum,
} from 'drizzle-orm';
import { database } from './index';
import { auditLog, invitation, member, subscription, usageEvent, webhookEvent } from './schema';

export type BillingPlan = 'free' | 'starter' | 'pro';

export type SubscriptionSnapshot = typeof subscription.$inferSelect;
export type WebhookClaimSnapshot = Pick<
  typeof webhookEvent.$inferSelect,
  'processed' | 'processingStartedAt' | 'lastError'
>;

export type StripeSubscriptionUpdate = {
  organizationId: string;
  customerId: string;
  subscriptionId: string;
  priceId: string | null;
  plan: BillingPlan;
  status: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  providerUpdatedAt: Date;
};

export function shouldApplyProviderUpdate(current: Date | null | undefined, incoming: Date) {
  return !current || incoming.getTime() >= current.getTime();
}

export function webhookClaimDecision(
  existing: WebhookClaimSnapshot | null | undefined,
  now = new Date(),
  leaseMs = 5 * 60 * 1000,
) {
  if (!existing || existing.processed) return 'duplicate' as const;
  if (
    existing.lastError ||
    !existing.processingStartedAt ||
    existing.processingStartedAt.getTime() < now.getTime() - leaseMs
  ) {
    return 'retry' as const;
  }
  return 'busy' as const;
}

export function paidPlanForSubscription(snapshot: SubscriptionSnapshot | null | undefined): BillingPlan {
  if (!snapshot) return 'free';
  if (snapshot.status !== 'active' && snapshot.status !== 'trialing') return 'free';
  return snapshot.plan === 'starter' || snapshot.plan === 'pro' ? snapshot.plan : 'free';
}

export async function getSubscriptionForOrganization(organizationId: string) {
  const db = database();
  const [row] = await db.select().from(subscription).where(eq(subscription.organizationId, organizationId)).limit(1);
  return row ?? null;
}

export async function getOrganizationIdByStripeCustomer(customerId: string) {
  const db = database();
  const [row] = await db
    .select({ organizationId: subscription.organizationId })
    .from(subscription)
    .where(eq(subscription.providerCustomerId, customerId))
    .limit(1);
  return row?.organizationId ?? null;
}

export async function ensureStripeCustomer(organizationId: string, customerId: string) {
  const db = database();
  const now = new Date();
  const [row] = await db
    .insert(subscription)
    .values({
      id: randomUUID(),
      organizationId,
      provider: 'stripe',
      providerCustomerId: customerId,
      plan: 'free',
      status: 'inactive',
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: subscription.organizationId,
      set: { providerCustomerId: customerId, updatedAt: now },
    })
    .returning();
  return row;
}

export async function syncStripeSubscription(update: StripeSubscriptionUpdate) {
  const db = database();
  const now = new Date();

  await db
    .insert(subscription)
    .values({
      id: randomUUID(),
      organizationId: update.organizationId,
      provider: 'stripe',
      providerCustomerId: update.customerId,
      providerSubscriptionId: update.subscriptionId,
      providerPriceId: update.priceId,
      providerUpdatedAt: update.providerUpdatedAt,
      plan: update.plan,
      status: update.status,
      currentPeriodEnd: update.currentPeriodEnd,
      cancelAtPeriodEnd: update.cancelAtPeriodEnd,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: subscription.organizationId });

  const [applied] = await db
    .update(subscription)
    .set({
      providerCustomerId: update.customerId,
      providerSubscriptionId: update.subscriptionId,
      providerPriceId: update.priceId,
      providerUpdatedAt: update.providerUpdatedAt,
      plan: update.plan,
      status: update.status,
      currentPeriodEnd: update.currentPeriodEnd,
      cancelAtPeriodEnd: update.cancelAtPeriodEnd,
      updatedAt: now,
    })
    .where(
      and(
        eq(subscription.organizationId, update.organizationId),
        or(isNull(subscription.providerUpdatedAt), lte(subscription.providerUpdatedAt, update.providerUpdatedAt)),
      ),
    )
    .returning();

  if (applied) return { applied: true, subscription: applied };
  return { applied: false, subscription: await getSubscriptionForOrganization(update.organizationId) };
}

export async function claimWebhookEvent(input: {
  provider: string;
  providerEventId: string;
  eventType: string;
  payload: Record<string, unknown>;
}) {
  const db = database();
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 5 * 60 * 1000);
  const id = randomUUID();

  const [inserted] = await db
    .insert(webhookEvent)
    .values({
      id,
      provider: input.provider,
      providerEventId: input.providerEventId,
      eventType: input.eventType,
      payload: input.payload,
      attemptCount: 1,
      processingStartedAt: now,
    })
    .onConflictDoNothing({ target: [webhookEvent.provider, webhookEvent.providerEventId] })
    .returning();

  if (inserted) return { state: 'claimed' as const, id: inserted.id };

  const [existing] = await db
    .select()
    .from(webhookEvent)
    .where(
      and(
        eq(webhookEvent.provider, input.provider),
        eq(webhookEvent.providerEventId, input.providerEventId),
      ),
    )
    .limit(1);

  const decision = webhookClaimDecision(existing, now);
  if (decision === 'duplicate') return { state: 'duplicate' as const, id: existing?.id ?? null };
  if (decision === 'busy') return { state: 'busy' as const, id: existing?.id ?? null };
  if (!existing) return { state: 'duplicate' as const, id: null };

  const [reclaimed] = await db
    .update(webhookEvent)
    .set({
      processingStartedAt: now,
      lastError: null,
      attemptCount: sql`${webhookEvent.attemptCount} + 1`,
    })
    .where(
      and(
        eq(webhookEvent.id, existing.id),
        eq(webhookEvent.processed, false),
        or(
          isNull(webhookEvent.processingStartedAt),
          lt(webhookEvent.processingStartedAt, staleBefore),
          isNotNull(webhookEvent.lastError),
        ),
      ),
    )
    .returning({ id: webhookEvent.id });

  return reclaimed
    ? { state: 'claimed' as const, id: reclaimed.id }
    : { state: 'busy' as const, id: existing.id };
}

export async function completeWebhookEvent(id: string) {
  const db = database();
  await db
    .update(webhookEvent)
    .set({ processed: true, processedAt: new Date(), processingStartedAt: null, lastError: null })
    .where(eq(webhookEvent.id, id));
}

export async function failWebhookEvent(id: string, error: unknown) {
  const db = database();
  const message = error instanceof Error ? error.message : String(error);
  await db
    .update(webhookEvent)
    .set({ processingStartedAt: null, lastError: message.slice(0, 4_000) })
    .where(eq(webhookEvent.id, id));
}

export async function getOrganizationSeatUsage(organizationId: string) {
  const db = database();
  const now = new Date();
  const [[memberRow], [pendingRow]] = await Promise.all([
    db.select({ value: count() }).from(member).where(eq(member.organizationId, organizationId)),
    db
      .select({ value: count() })
      .from(invitation)
      .where(
        and(
          eq(invitation.organizationId, organizationId),
          eq(invitation.status, 'pending'),
          gte(invitation.expiresAt, now),
        ),
      ),
  ]);
  return {
    members: memberRow?.value ?? 0,
    pendingInvitations: pendingRow?.value ?? 0,
  };
}

export async function getMonthlyUsage(organizationId: string, metric: string, now = new Date()) {
  const db = database();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [row] = await db
    .select({ value: sum(usageEvent.quantity) })
    .from(usageEvent)
    .where(
      and(
        eq(usageEvent.organizationId, organizationId),
        eq(usageEvent.metric, metric),
        gte(usageEvent.createdAt, monthStart),
      ),
    );
  return Number(row?.value ?? 0);
}

export async function recordUsage(input: {
  organizationId: string;
  actorUserId?: string | null;
  metric: string;
  quantity: number;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}) {
  const db = database();
  const [row] = await db
    .insert(usageEvent)
    .values({
      id: randomUUID(),
      organizationId: input.organizationId,
      actorUserId: input.actorUserId ?? null,
      metric: input.metric,
      quantity: input.quantity,
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata,
    })
    .onConflictDoNothing({ target: usageEvent.idempotencyKey })
    .returning();
  return row ?? null;
}

export async function writeAuditLog(input: {
  organizationId?: string | null;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const db = database();
  await db.insert(auditLog).values({
    id: randomUUID(),
    organizationId: input.organizationId ?? null,
    actorUserId: input.actorUserId ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    metadata: input.metadata,
  });
}