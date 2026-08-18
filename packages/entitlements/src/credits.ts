import type { PlanId } from '@factory/contracts';

export type AiCreditPolicy = {
  includedMicros: number;
  overageAllowed: boolean;
};

export const aiCreditPolicies: Record<PlanId, AiCreditPolicy> = {
  free: { includedMicros: 100_000, overageAllowed: false },
  starter: { includedMicros: 5_000_000, overageAllowed: false },
  pro: { includedMicros: 50_000_000, overageAllowed: true },
};

export function aiCreditPolicy(plan: PlanId) {
  return aiCreditPolicies[plan];
}

export type CreditReservationDecision =
  | { allowed: true; balanceAfterReservationMicros: number }
  | { allowed: false; reason: 'credit_limit'; balanceAfterReservationMicros: number };

export function decideCreditReservation(input: {
  balanceMicros: number;
  reservationMicros: number;
  overageAllowed: boolean;
}): CreditReservationDecision {
  const balanceAfterReservationMicros = input.balanceMicros - input.reservationMicros;
  if (!input.overageAllowed && balanceAfterReservationMicros < 0) {
    return { allowed: false, reason: 'credit_limit', balanceAfterReservationMicros };
  }
  return { allowed: true, balanceAfterReservationMicros };
}
