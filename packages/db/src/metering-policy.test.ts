import { describe, expect, it } from 'vitest';
import {
  allocateClosedPeriodOverage,
  isClosedUsageCreditPeriod,
  stripeMeterProviderIdentifier,
} from './metering-policy';

describe('closed-period Stripe metering policy', () => {
  it('allocates only settled cost above the included allowance', () => {
    expect(
      allocateClosedPeriodOverage(
        [
          { ledgerEntryId: 'a', actualCostMicros: 600_000 },
          { ledgerEntryId: 'b', actualCostMicros: 700_000 },
          { ledgerEntryId: 'c', actualCostMicros: 300_000 },
        ],
        1_000_000,
      ),
    ).toEqual([
      { ledgerEntryId: 'b', actualCostMicros: 700_000, valueMicros: 300_000 },
      { ledgerEntryId: 'c', actualCostMicros: 300_000, valueMicros: 300_000 },
    ]);
  });

  it('never emits reservation-only usage', () => {
    expect(allocateClosedPeriodOverage([], 100_000)).toEqual([]);
  });

  it('rejects current and malformed periods', () => {
    const now = new Date('2026-09-09T12:00:00Z');
    expect(isClosedUsageCreditPeriod('2026-08', now)).toBe(true);
    expect(isClosedUsageCreditPeriod('2026-09', now)).toBe(false);
    expect(isClosedUsageCreditPeriod('2026-10', now)).toBe(false);
    expect(isClosedUsageCreditPeriod('bad', now)).toBe(false);
  });

  it('uses a stable short provider identifier', () => {
    expect(stripeMeterProviderIdentifier('123e4567-e89b-12d3-a456-426614174000')).toBe(
      'asf_123e4567-e89b-12d3-a456-426614174000',
    );
  });
});
