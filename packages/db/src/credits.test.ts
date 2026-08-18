import { describe, expect, it } from 'vitest';
import { creditSettlementAmountMicros, usageCreditPeriodKey } from './credits';

describe('usage credit ledger helpers', () => {
  it('uses UTC month keys so billing periods are timezone-stable', () => {
    expect(usageCreditPeriodKey(new Date('2026-08-31T23:59:59Z'))).toBe('2026-08');
    expect(usageCreditPeriodKey(new Date('2026-09-01T00:00:00Z'))).toBe('2026-09');
  });

  it('refunds unused reservation and debits over-reservation deterministically', () => {
    expect(creditSettlementAmountMicros({ reservationMicros: 100_000, actualCostMicros: 25_000 })).toBe(75_000);
    expect(creditSettlementAmountMicros({ reservationMicros: 100_000, actualCostMicros: 140_000 })).toBe(-40_000);
  });
});
