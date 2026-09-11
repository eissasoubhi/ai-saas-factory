import { usageCreditPeriodKey } from './credits';

export type SettledUsageCost = {
  ledgerEntryId: string;
  actualCostMicros: number;
};

export type OverageAllocation = SettledUsageCost & {
  valueMicros: number;
};

const STRIPE_METER_MAX_AGE_MS = 35 * 24 * 60 * 60 * 1_000;

function parsePeriodKey(periodKey: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(periodKey);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || month < 1 || month > 12) return null;
  return { year, month };
}

export function isClosedUsageCreditPeriod(periodKey: string, now = new Date()) {
  if (!parsePeriodKey(periodKey)) return false;
  return periodKey < usageCreditPeriodKey(now);
}

export function usageCreditPeriodEnd(periodKey: string) {
  const parsed = parsePeriodKey(periodKey);
  if (!parsed) throw new Error('Usage credit period must use YYYY-MM with a valid month');
  return new Date(Date.UTC(parsed.year, parsed.month, 1) - 1_000);
}

export function isStripeMeterPeriodWithinSubmissionWindow(periodKey: string, now = new Date()) {
  if (!isClosedUsageCreditPeriod(periodKey, now)) return false;
  const meteredAt = usageCreditPeriodEnd(periodKey);
  return meteredAt.getTime() >= now.getTime() - STRIPE_METER_MAX_AGE_MS;
}

export function periodAllowsStripeOverage(planReferences: readonly (string | null)[]) {
  return planReferences.some((plan) => plan === 'pro');
}

export function allocateClosedPeriodOverage(
  settlements: readonly SettledUsageCost[],
  allowanceMicros: number,
): OverageAllocation[] {
  if (!Number.isSafeInteger(allowanceMicros)) {
    throw new Error('Allowance must be a safe integer number of micros');
  }

  const normalizedAllowance = Math.max(0, allowanceMicros);
  let cumulativeCostMicros = 0;
  let previousOverageMicros = 0;
  const allocations: OverageAllocation[] = [];

  for (const settlement of settlements) {
    if (!Number.isSafeInteger(settlement.actualCostMicros) || settlement.actualCostMicros < 0) {
      throw new Error('Settled AI cost must be a non-negative safe integer number of micros');
    }
    cumulativeCostMicros += settlement.actualCostMicros;
    if (!Number.isSafeInteger(cumulativeCostMicros)) {
      throw new Error('Cumulative settled AI cost exceeds safe integer range');
    }
    const nextOverageMicros = Math.max(0, cumulativeCostMicros - normalizedAllowance);
    const valueMicros = nextOverageMicros - previousOverageMicros;
    previousOverageMicros = nextOverageMicros;
    if (valueMicros > 0) allocations.push({ ...settlement, valueMicros });
  }

  return allocations;
}

export function stripeMeterProviderIdentifier(ledgerEntryId: string) {
  const identifier = `asf_${ledgerEntryId}`;
  if (identifier.length > 100) throw new Error('Stripe meter event identifier exceeds 100 characters');
  return identifier;
}
