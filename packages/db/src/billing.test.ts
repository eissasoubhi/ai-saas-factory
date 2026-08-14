import { describe, expect, it } from 'vitest';
import {
  paidPlanForSubscription,
  shouldApplyProviderUpdate,
  webhookClaimDecision,
  type SubscriptionSnapshot,
  type WebhookClaimSnapshot,
} from './billing';

function snapshot(plan: 'free' | 'starter' | 'pro', status: string): SubscriptionSnapshot {
  return { plan, status } as SubscriptionSnapshot;
}

function claimSnapshot(input: Partial<WebhookClaimSnapshot> = {}): WebhookClaimSnapshot {
  return {
    processed: false,
    processingStartedAt: null,
    lastError: null,
    ...input,
  };
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

  it('accepts an equal timestamp so authoritative-state replay is deterministic', () => {
    const at = new Date('2026-08-14T00:00:00Z');
    expect(shouldApplyProviderUpdate(at, at)).toBe(true);
  });
});

describe('webhook idempotency claims', () => {
  const now = new Date('2026-08-14T00:10:00Z');

  it('treats an already processed provider event as a duplicate', () => {
    expect(webhookClaimDecision(claimSnapshot({ processed: true }), now)).toBe('duplicate');
  });

  it('does not concurrently process an event with a live claim', () => {
    expect(
      webhookClaimDecision(
        claimSnapshot({ processingStartedAt: new Date('2026-08-14T00:09:00Z') }),
        now,
      ),
    ).toBe('busy');
  });

  it('retries an explicitly failed event', () => {
    expect(webhookClaimDecision(claimSnapshot({ lastError: 'temporary provider error' }), now)).toBe('retry');
  });

  it('reclaims an abandoned processing lease', () => {
    expect(
      webhookClaimDecision(
        claimSnapshot({ processingStartedAt: new Date('2026-08-14T00:04:59Z') }),
        now,
      ),
    ).toBe('retry');
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