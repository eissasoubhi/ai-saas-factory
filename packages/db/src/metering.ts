import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray, isNull, lt, or, sql, sum } from 'drizzle-orm';
import { usageCreditLedger } from './credits-schema';
import { database } from './index';
import {
  allocateClosedPeriodOverage,
  isClosedUsageCreditPeriod,
  periodAllowsStripeOverage,
  stripeMeterProviderIdentifier,
  usageCreditPeriodEnd,
} from './metering-policy';
import { stripeMeterSubmission } from './metering-schema';

function settlementActualCostMicros(metadata: Record<string, unknown> | null) {
  const value = metadata?.actualCostMicros;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('Settlement ledger entry is missing a valid actualCostMicros value');
  }
  return value;
}

export async function reconcileClosedPeriodStripeMetering(input: {
  organizationId: string;
  periodKey: string;
  providerCustomerId: string;
  eventName: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  if (!isClosedUsageCreditPeriod(input.periodKey, now)) {
    throw new Error('Stripe metering can only reconcile a closed UTC credit period');
  }
  if (!input.providerCustomerId.trim()) throw new Error('Stripe customer ID is required');
  if (!input.eventName.trim() || input.eventName.length > 100) {
    throw new Error('Stripe meter event name must contain 1-100 characters');
  }

  const meteredAt = usageCreditPeriodEnd(input.periodKey);
  const db = database();
  return db.transaction(async (tx) => {
    const lockKey = `stripe-meter-reconcile:${input.organizationId}:${input.periodKey}`;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);

    const [[creditRow], planGrants, settlements] = await Promise.all([
      tx
        .select({ value: sum(usageCreditLedger.amountMicros) })
        .from(usageCreditLedger)
        .where(
          and(
            eq(usageCreditLedger.organizationId, input.organizationId),
            eq(usageCreditLedger.periodKey, input.periodKey),
            or(eq(usageCreditLedger.kind, 'grant'), eq(usageCreditLedger.kind, 'adjustment')),
          ),
        ),
      tx
        .select({ plan: usageCreditLedger.referenceId })
        .from(usageCreditLedger)
        .where(
          and(
            eq(usageCreditLedger.organizationId, input.organizationId),
            eq(usageCreditLedger.periodKey, input.periodKey),
            eq(usageCreditLedger.kind, 'grant'),
            eq(usageCreditLedger.source, 'plan.monthly'),
          ),
        ),
      tx
        .select({
          ledgerEntryId: usageCreditLedger.id,
          metadata: usageCreditLedger.metadata,
        })
        .from(usageCreditLedger)
        .where(
          and(
            eq(usageCreditLedger.organizationId, input.organizationId),
            eq(usageCreditLedger.periodKey, input.periodKey),
            eq(usageCreditLedger.kind, 'settlement'),
            eq(usageCreditLedger.source, 'ai.generation'),
          ),
        )
        .orderBy(asc(usageCreditLedger.effectiveAt), asc(usageCreditLedger.id)),
    ]);

    const allowanceMicros = Math.max(0, Number(creditRow?.value ?? 0));
    const settled = settlements.map((row) => ({
      ledgerEntryId: row.ledgerEntryId,
      actualCostMicros: settlementActualCostMicros(row.metadata),
    }));
    const overageAllowedForPeriod = periodAllowsStripeOverage(planGrants.map((row) => row.plan));
    const allocations = overageAllowedForPeriod
      ? allocateClosedPeriodOverage(settled, allowanceMicros)
      : [];
    const createdSubmissionIds: string[] = [];

    for (const allocation of allocations) {
      const id = randomUUID();
      const [inserted] = await tx
        .insert(stripeMeterSubmission)
        .values({
          id,
          organizationId: input.organizationId,
          ledgerEntryId: allocation.ledgerEntryId,
          periodKey: input.periodKey,
          providerCustomerId: input.providerCustomerId,
          eventName: input.eventName,
          valueMicros: allocation.valueMicros,
          providerIdentifier: stripeMeterProviderIdentifier(allocation.ledgerEntryId),
          meteredAt,
          status: 'pending',
          updatedAt: now,
        })
        .onConflictDoNothing({ target: stripeMeterSubmission.ledgerEntryId })
        .returning({ id: stripeMeterSubmission.id });
      if (inserted) createdSubmissionIds.push(inserted.id);
    }

    return {
      periodKey: input.periodKey,
      meteredAt,
      allowanceMicros,
      overageAllowedForPeriod,
      settledCostMicros: settled.reduce((total, row) => total + row.actualCostMicros, 0),
      overageMicros: allocations.reduce((total, row) => total + row.valueMicros, 0),
      createdSubmissionIds,
    };
  });
}

export async function listStripeMeterSubmissionsForOrganization(input: {
  organizationId: string;
  periodKey?: string;
  limit?: number;
}) {
  const limit = Math.max(1, Math.min(100, Math.trunc(input.limit ?? 50)));
  const db = database();
  const conditions = [eq(stripeMeterSubmission.organizationId, input.organizationId)];
  if (input.periodKey) conditions.push(eq(stripeMeterSubmission.periodKey, input.periodKey));
  return db
    .select({
      id: stripeMeterSubmission.id,
      organizationId: stripeMeterSubmission.organizationId,
      periodKey: stripeMeterSubmission.periodKey,
      ledgerEntryId: stripeMeterSubmission.ledgerEntryId,
      eventName: stripeMeterSubmission.eventName,
      valueMicros: stripeMeterSubmission.valueMicros,
      status: stripeMeterSubmission.status,
      attemptCount: stripeMeterSubmission.attemptCount,
      lastError: stripeMeterSubmission.lastError,
      meteredAt: stripeMeterSubmission.meteredAt,
      sentAt: stripeMeterSubmission.sentAt,
      createdAt: stripeMeterSubmission.createdAt,
    })
    .from(stripeMeterSubmission)
    .where(and(...conditions))
    .orderBy(desc(stripeMeterSubmission.createdAt), desc(stripeMeterSubmission.id))
    .limit(limit);
}

export async function getStripeMeterSubmissionForWorker(id: string) {
  const db = database();
  const [row] = await db.select().from(stripeMeterSubmission).where(eq(stripeMeterSubmission.id, id)).limit(1);
  return row ?? null;
}

export async function claimStripeMeterSubmission(id: string, now = new Date(), leaseMs = 5 * 60 * 1000) {
  const db = database();
  const [existing] = await db.select().from(stripeMeterSubmission).where(eq(stripeMeterSubmission.id, id)).limit(1);
  if (!existing) return { state: 'missing' as const, submission: null };
  if (existing.status === 'sent') return { state: 'sent' as const, submission: existing };

  const staleBefore = new Date(now.getTime() - leaseMs);
  const [claimed] = await db
    .update(stripeMeterSubmission)
    .set({
      status: 'processing',
      attemptCount: sql`${stripeMeterSubmission.attemptCount} + 1`,
      processingStartedAt: now,
      lastError: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(stripeMeterSubmission.id, id),
        or(
          inArray(stripeMeterSubmission.status, ['pending', 'failed']),
          and(
            eq(stripeMeterSubmission.status, 'processing'),
            or(
              isNull(stripeMeterSubmission.processingStartedAt),
              lt(stripeMeterSubmission.processingStartedAt, staleBefore),
            ),
          ),
        ),
      ),
    )
    .returning();

  return claimed
    ? { state: 'claimed' as const, submission: claimed }
    : { state: 'busy' as const, submission: existing };
}

export async function markStripeMeterSubmissionSent(id: string, sentAt = new Date()) {
  const db = database();
  await db
    .update(stripeMeterSubmission)
    .set({ status: 'sent', sentAt, processingStartedAt: null, lastError: null, updatedAt: sentAt })
    .where(eq(stripeMeterSubmission.id, id));
}

export async function markStripeMeterSubmissionFailed(id: string, error: unknown, terminal = false) {
  const message = error instanceof Error ? error.message : String(error);
  const db = database();
  await db
    .update(stripeMeterSubmission)
    .set({
      status: terminal ? 'dead' : 'failed',
      processingStartedAt: null,
      lastError: message.slice(0, 4_000),
      updatedAt: new Date(),
    })
    .where(eq(stripeMeterSubmission.id, id));
}
