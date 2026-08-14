export type AiQuotaDecision =
  | { allowed: true; monthlyUsed: number; minuteUsed: number }
  | {
      allowed: false;
      reason: 'monthly_limit' | 'rate_limit';
      monthlyUsed: number;
      minuteUsed: number;
    };

export function decideAiQuota(input: {
  monthlyUsed: number;
  minuteUsed: number;
  monthlyLimit: number;
  perMinuteLimit: number;
}): AiQuotaDecision {
  if (input.monthlyUsed >= input.monthlyLimit) {
    return {
      allowed: false,
      reason: 'monthly_limit',
      monthlyUsed: input.monthlyUsed,
      minuteUsed: input.minuteUsed,
    };
  }
  if (input.minuteUsed >= input.perMinuteLimit) {
    return {
      allowed: false,
      reason: 'rate_limit',
      monthlyUsed: input.monthlyUsed,
      minuteUsed: input.minuteUsed,
    };
  }
  return {
    allowed: true,
    monthlyUsed: input.monthlyUsed + 1,
    minuteUsed: input.minuteUsed + 1,
  };
}
