import { describe, expect, it } from 'vitest';
import { decideAiQuota } from './ai-policy';

describe('AI quota policy', () => {
  it('reserves the next request below both limits', () => {
    expect(
      decideAiQuota({ monthlyUsed: 9, monthlyLimit: 100, minuteUsed: 2, perMinuteLimit: 10 }),
    ).toEqual({ allowed: true, monthlyUsed: 10, minuteUsed: 3 });
  });

  it('fails closed at the monthly entitlement limit', () => {
    expect(
      decideAiQuota({ monthlyUsed: 100, monthlyLimit: 100, minuteUsed: 0, perMinuteLimit: 10 }),
    ).toMatchObject({ allowed: false, reason: 'monthly_limit' });
  });

  it('rate limits a burst even when monthly entitlement remains', () => {
    expect(
      decideAiQuota({ monthlyUsed: 10, monthlyLimit: 100, minuteUsed: 10, perMinuteLimit: 10 }),
    ).toMatchObject({ allowed: false, reason: 'rate_limit' });
  });
});
