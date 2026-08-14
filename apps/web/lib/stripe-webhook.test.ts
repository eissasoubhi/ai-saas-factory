import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseStripeEvent, verifyStripeWebhookSignature } from './stripe-webhook';

const secret = 'whsec_test_secret';
const timestamp = 1_786_665_600;
const rawBody = JSON.stringify({
  id: 'evt_123',
  type: 'customer.subscription.updated',
  created: timestamp,
  data: { object: { id: 'sub_123' } },
});

function signature(body = rawBody, at = timestamp) {
  return createHmac('sha256', secret).update(`${at}.${body}`, 'utf8').digest('hex');
}

describe('Stripe webhook verification', () => {
  it('accepts a current valid v1 signature', () => {
    expect(() =>
      verifyStripeWebhookSignature({
        rawBody,
        signatureHeader: `t=${timestamp},v1=${signature()}`,
        secret,
        nowMs: timestamp * 1000,
      }),
    ).not.toThrow();
  });

  it('rejects a modified payload', () => {
    expect(() =>
      verifyStripeWebhookSignature({
        rawBody: `${rawBody} `,
        signatureHeader: `t=${timestamp},v1=${signature()}`,
        secret,
        nowMs: timestamp * 1000,
      }),
    ).toThrow(/verification failed/);
  });

  it('rejects replay outside the default five minute window', () => {
    expect(() =>
      verifyStripeWebhookSignature({
        rawBody,
        signatureHeader: `t=${timestamp},v1=${signature()}`,
        secret,
        nowMs: (timestamp + 301) * 1000,
      }),
    ).toThrow(/tolerance/);
  });
});

describe('Stripe event parsing', () => {
  it('accepts the minimal event envelope used by the processor', () => {
    expect(parseStripeEvent(rawBody).id).toBe('evt_123');
  });
});
