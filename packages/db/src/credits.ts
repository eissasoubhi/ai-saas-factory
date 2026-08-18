import { randomUUID } from 'node:crypto';
import { and, eq, sql, sum } from 'drizzle-orm';
import { usageCreditLedger } from './credits-schema';
import { database } from './index';

export type UsageCreditKind = 'grant' | 'reservation' | 'settlement' | 'adjustment';

export function usageCreditPeriodKey(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function creditSettlementAmountMicros(input: {
  reservationMicros: number;
  actualCostMicros: number;
}) {
  return input.reservationMicros - input.actualCostMicros;
}

export async function appendUsageCreditEntry(input: {
  organizationId: string;
  actorUserId?: string | null;
  periodKey: string;
  kind: UsageCreditKind;
  amountMicros: number;
  source: string;
  referenceId?: string | null;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
  effectiveAt?: Date;
}) {
  if (!Number.isSafeInteger(input.amountMicros)) {
    throw new Error('Credit amount must be a safe integer number of micros');
  }

  const db = database();
  const [inserted] = await db
    .insert(usageCreditLedger)
    .values({
      id: randomUUID(),
      organizationId: input.organizationId,
      actorUserId: input.actorUserId ?? null,
      periodKey: input.periodKey,
      kind: input.kind,
      amountMicros: input.amountMicros,
      source: input.source,
      referenceId: input.referenceId ?? null,
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata,
      effectiveAt: input.effectiveAt ?? new Date(),
    })
    .onConflictDoNothing({ target: usageCreditLedger.idempotencyKey })
    .returning();

  if (inserted) return { entry: inserted, inserted: true as const };

  const [existing] = await db
    .select()
    .from(usageCreditLedger)
    .where(eq(usageCreditLedger.idempotencyKey, input.idempotencyKey))
    .limit(1);
  if (!existing || existing.organizationId !== input.organizationId) {
    throw new Error('Credit idempotency key collision across organizations');
  }
  return { entry: existing, inserted: false as const };
}

export async function getUsageCreditBalance(organizationId: string, periodKey: string) {
  const db = database();
  const [row] = await db
    .select({ value: sum(usageCreditLedger.amountMicros) })
    .from(usageCreditLedger)
    .where(
      and(
        eq(usageCreditLedger.organizationId, organizationId),
        eq(usageCreditLedger.periodKey, periodKey),
      ),
    );
  return Number(row?.value ?? 0);
}

export async function ensureMonthlyPlanCreditGrant(input: {
  organizationId: string;
  plan: string;
  includedMicros: number;
  periodKey?: string;
  effectiveAt?: Date;
}) {
  if (!Number.isSafeInteger(input.includedMicros) || input.includedMicros < 0) {
    throw new Error('Included monthly credits must be a non-negative safe integer number of micros');
  }

  const db = database();
  const effectiveAt = input.effectiveAt ?? new Date();
  const periodKey = input.periodKey ?? usageCreditPeriodKey(effectiveAt);

  return db.transaction(async (tx) => {
    const lockKey = `usage-credit-grant:${input.organizationId}:${periodKey}`;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);

    const [grantRow] = await tx
      .select({ value: sum(usageCreditLedger.amountMicros) })
      .from(usageCreditLedger)
      .where(
        and(
          eq(usageCreditLedger.organizationId, input.organizationId),
          eq(usageCreditLedger.periodKey, periodKey),
          eq(usageCreditLedger.kind, 'grant'),
          eq(usageCreditLedger.source, 'plan.monthly'),
        ),
      );
    const alreadyGrantedMicros = Number(grantRow?.value ?? 0);
    const topUpMicros = Math.max(0, input.includedMicros - alreadyGrantedMicros);
    if (topUpMicros === 0) {
      return { grantedMicros: 0, alreadyGrantedMicros, targetMicros: input.includedMicros };
    }

    const idempotencyKey = `credit-grant/${input.organizationId}/${periodKey}/${input.includedMicros}`;
    const [inserted] = await tx
      .insert(usageCreditLedger)
      .values({
        id: randomUUID(),
        organizationId: input.organizationId,
        periodKey,
        kind: 'grant',
        amountMicros: topUpMicros,
        source: 'plan.monthly',
        referenceId: input.plan,
        idempotencyKey,
        metadata: {
          plan: input.plan,
          targetMicros: input.includedMicros,
          previousGrantedMicros: alreadyGrantedMicros,
        },
        effectiveAt,
      })
      .onConflictDoNothing({ target: usageCreditLedger.idempotencyKey })
      .returning({ amountMicros: usageCreditLedger.amountMicros });

    return {
      grantedMicros: inserted?.amountMicros ?? 0,
      alreadyGrantedMicros,
      targetMicros: input.includedMicros,
    };
  });
}

export type CreditReservationResult =
  | { allowed: true; balanceBeforeMicros: number; balanceAfterMicros: number; alreadyReserved: boolean }
  | { allowed: false; reason: 'credit_limit'; balanceBeforeMicros: number; balanceAfterMicros: number };

export async function reserveUsageCredits(input: {
  organizationId: string;
  actorUserId: string;
  requestId: string;
  reservationMicros: number;
  overageAllowed: boolean;
  periodKey?: string;
  now?: Date;
}): Promise<CreditReservationResult> {
  if (!Number.isSafeInteger(input.reservationMicros) || input.reservationMicros <= 0) {
    throw new Error('Credit reservation must be a positive safe integer number of micros');
  }
  const db = database();
  const now = input.now ?? new Date();
  const periodKey = input.periodKey ?? usageCreditPeriodKey(now);
  const idempotencyKey = `credit-reservation/${input.organizationId}/${input.requestId}`;

  return db.transaction(async (tx) => {
    const lockKey = `usage-credit:${input.organizationId}:${periodKey}`;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);

    const [existing] = await tx
      .select({ id: usageCreditLedger.id })
      .from(usageCreditLedger)
      .where(
        and(
          eq(usageCreditLedger.organizationId, input.organizationId),
          eq(usageCreditLedger.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);

    const [balanceRow] = await tx
      .select({ value: sum(usageCreditLedger.amountMicros) })
      .from(usageCreditLedger)
      .where(
        and(
          eq(usageCreditLedger.organizationId, input.organizationId),
          eq(usageCreditLedger.periodKey, periodKey),
        ),
      );
    const balanceBeforeMicros = Number(balanceRow?.value ?? 0);

    if (existing) {
      return {
        allowed: true,
        balanceBeforeMicros,
        balanceAfterMicros: balanceBeforeMicros,
        alreadyReserved: true,
      };
    }

    const balanceAfterMicros = balanceBeforeMicros - input.reservationMicros;
    if (!input.overageAllowed && balanceAfterMicros < 0) {
      return { allowed: false, reason: 'credit_limit', balanceBeforeMicros, balanceAfterMicros };
    }

    await tx.insert(usageCreditLedger).values({
      id: randomUUID(),
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      periodKey,
      kind: 'reservation',
      amountMicros: -input.reservationMicros,
      source: 'ai.request',
      referenceId: input.requestId,
      idempotencyKey,
      metadata: { reservationMicros: input.reservationMicros },
      effectiveAt: now,
    });

    return { allowed: true, balanceBeforeMicros, balanceAfterMicros, alreadyReserved: false };
  });
}

export async function settleUsageCreditReservation(input: {
  organizationId: string;
  actorUserId: string;
  requestId: string;
  reservationMicros: number;
  actualCostMicros: number;
  periodKey?: string;
  now?: Date;
}) {
  if (!Number.isSafeInteger(input.actualCostMicros) || input.actualCostMicros < 0) {
    throw new Error('Actual AI cost must be a non-negative safe integer number of micros');
  }
  const periodKey = input.periodKey ?? usageCreditPeriodKey(input.now);
  const settlementMicros = creditSettlementAmountMicros({
    reservationMicros: input.reservationMicros,
    actualCostMicros: input.actualCostMicros,
  });
  return appendUsageCreditEntry({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    periodKey,
    kind: 'settlement',
    amountMicros: settlementMicros,
    source: 'ai.generation',
    referenceId: input.requestId,
    idempotencyKey: `credit-settlement/${input.organizationId}/${input.requestId}`,
    metadata: {
      reservationMicros: input.reservationMicros,
      actualCostMicros: input.actualCostMicros,
    },
    ...(input.now ? { effectiveAt: input.now } : {}),
  });
}

export async function releaseUsageCreditReservation(input: {
  organizationId: string;
  actorUserId: string;
  requestId: string;
  reservationMicros: number;
  periodKey?: string;
  now?: Date;
}) {
  return settleUsageCreditReservation({ ...input, actualCostMicros: 0 });
}
