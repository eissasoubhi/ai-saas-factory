import { describe, expect, it } from 'vitest';
import { aiCreditPolicy, decideCreditReservation } from './credits';

describe('AI credit policy', () => {
  it('defines increasing included budgets by paid tier', () => {
    expect(aiCreditPolicy('free').includedMicros).toBeLessThan(aiCreditPolicy('starter').includedMicros);
    expect(aiCreditPolicy('starter').includedMicros).toBeLessThan(aiCreditPolicy('pro').includedMicros);
  });

  it('hard-stops non-overage plans before creating a negative reservation balance', () => {
    expect(
      decideCreditReservation({ balanceMicros: 50_000, reservationMicros: 100_000, overageAllowed: false }),
    ).toEqual({
      allowed: false,
      reason: 'credit_limit',
      balanceAfterReservationMicros: -50_000,
    });
  });

  it('allows explicit overage plans to reserve through zero', () => {
    expect(
      decideCreditReservation({ balanceMicros: 50_000, reservationMicros: 100_000, overageAllowed: true }),
    ).toEqual({ allowed: true, balanceAfterReservationMicros: -50_000 });
  });
});
