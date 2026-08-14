import { describe, expect, it } from 'vitest';
import { paidPlanForSubscription, shouldApplyProviderUpdate, type SubscriptionSnapshot } from './billing';

function snapshot(plan: 'free' | 'starter' | 'pro', status: string): SubscriptionSnapshot {
  return { plan, status } as SubscriptionSnapshot;
}

describe('billing ordering', () => {
  it('accepts the first provider update', () => {
    expect(shouldApplyProviderUpdate(null, new Date('2026-08-14T00:00:00Z'))).toBe(true);
  });

  it('rejects an older provider update', () => {
    expect(
      shouldApplyProviderUpdate(
        new Date('2026-08-14T00:01:00Z'),
        new Date('2026-08-14T00:00:00Z'),
      ),
    ).toBe(false);
  });

  it('accepts an equal timestamp so webhook replay is deterministic', () => {
    const at = new Date('2026-08-14T00:00:00Z');
    expect(shouldApplyProviderUpdate(at, at)).toBe(true);
  });
});

describe('paid plan resolution', () => {
  it('keeps paid entitlements only for active or trialing subscriptions', () => {
    expect(paidPlanForSubscription(snapshot('starter', 'active'))).toBe('starter');
    expect(paidPlanForSubscription(snapshot('pro', 'trialing'))).toBe('pro');
    expect(paidPlanForSubscription(snapshot('pro', 'past_due'))).toBe('free');
    expect(paidPlanForSubscription(snapshot('starter', 'canceled'))).toBe('free');
  });
});
