import { describe, expect, it } from 'vitest';
import { assertOrganizationScope, decideAiQuota } from './ai-policy';

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

describe('AI tenant isolation policy', () => {
  it('accepts resources belonging to the active organization', () => {
    const records = [{ organizationId: 'org-a', id: 'message-1' }];
    expect(assertOrganizationScope('org-a', records)).toBe(records);
  });

  it('rejects a single cross-tenant record before it can enter model context', () => {
    expect(() =>
      assertOrganizationScope('org-a', [
        { organizationId: 'org-a', id: 'message-1' },
        { organizationId: 'org-b', id: 'message-from-another-tenant' },
      ]),
    ).toThrow(/Tenant isolation violation/);
  });
});
