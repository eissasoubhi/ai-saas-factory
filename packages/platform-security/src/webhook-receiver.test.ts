import { describe, expect, it } from 'vitest';
import { signWebhookPayload, verifyWebhookSignature } from './index';

type ReceiverInput = {
  secret: string;
  eventId: string;
  timestamp: number;
  signature: string;
  body: string;
  now: number;
  seen: Set<string>;
};

function receiveSignedWebhook(input: ReceiverInput) {
  if (Math.abs(input.now - input.timestamp) > 300) {
    return { ok: false as const, reason: 'stale_timestamp' as const };
  }
  if (input.seen.has(input.eventId)) {
    return { ok: false as const, reason: 'replay' as const };
  }
  if (
    !verifyWebhookSignature(
      input.secret,
      { timestamp: input.timestamp, eventId: input.eventId, body: input.body },
      input.signature,
    )
  ) {
    return { ok: false as const, reason: 'invalid_signature' as const };
  }
  input.seen.add(input.eventId);
  return { ok: true as const };
}

describe('signed webhook receiver integration contract', () => {
  it('accepts the exact signed body once and rejects replay', () => {
    const secret = 'whsec_local_smoke_secret';
    const eventId = 'evt_smoke_1';
    const timestamp = 1_800_000_000;
    const body = JSON.stringify({ id: eventId, type: 'file.ready', data: { fileId: 'file-a' } });
    const signature = signWebhookPayload(secret, { timestamp, eventId, body });
    const seen = new Set<string>();

    expect(receiveSignedWebhook({ secret, eventId, timestamp, body, signature, now: timestamp, seen })).toEqual({
      ok: true,
    });
    expect(receiveSignedWebhook({ secret, eventId, timestamp, body, signature, now: timestamp, seen })).toEqual({
      ok: false,
      reason: 'replay',
    });
  });

  it('rejects body tampering and stale timestamps', () => {
    const secret = 'whsec_local_smoke_secret';
    const eventId = 'evt_smoke_2';
    const timestamp = 1_800_000_000;
    const body = JSON.stringify({ id: eventId, type: 'ai.generation.completed' });
    const signature = signWebhookPayload(secret, { timestamp, eventId, body });

    expect(
      receiveSignedWebhook({
        secret,
        eventId,
        timestamp,
        body: `${body} `,
        signature,
        now: timestamp,
        seen: new Set(),
      }),
    ).toEqual({ ok: false, reason: 'invalid_signature' });

    expect(
      receiveSignedWebhook({
        secret,
        eventId,
        timestamp,
        body,
        signature,
        now: timestamp + 301,
        seen: new Set(),
      }),
    ).toEqual({ ok: false, reason: 'stale_timestamp' });
  });
});
