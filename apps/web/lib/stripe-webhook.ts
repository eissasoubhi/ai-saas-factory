import { createHmac, timingSafeEqual } from 'node:crypto';

export type StripeEvent = {
  id: string;
  type: string;
  created: number;
  data: { object: Record<string, unknown> };
};

type SignatureParts = { timestamp: number; signatures: string[] };

function parseSignatureHeader(header: string): SignatureParts {
  let timestamp: number | null = null;
  const signatures: string[] = [];

  for (const part of header.split(',')) {
    const [key, value] = part.trim().split('=', 2);
    if (key === 't' && value) timestamp = Number(value);
    if (key === 'v1' && value) signatures.push(value);
  }

  if (!timestamp || !Number.isFinite(timestamp) || signatures.length === 0) {
    throw new Error('Malformed Stripe-Signature header');
  }
  return { timestamp, signatures };
}

function safeHexEqual(expectedHex: string, candidateHex: string) {
  if (!/^[0-9a-f]+$/i.test(candidateHex)) return false;
  const expected = Buffer.from(expectedHex, 'hex');
  const candidate = Buffer.from(candidateHex, 'hex');
  return expected.length === candidate.length && timingSafeEqual(expected, candidate);
}

export function verifyStripeWebhookSignature(input: {
  rawBody: string;
  signatureHeader: string;
  secret: string;
  nowMs?: number;
  toleranceSeconds?: number;
}) {
  const { timestamp, signatures } = parseSignatureHeader(input.signatureHeader);
  const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1000);
  const tolerance = input.toleranceSeconds ?? 300;

  if (Math.abs(nowSeconds - timestamp) > tolerance) {
    throw new Error('Stripe webhook timestamp is outside the allowed tolerance');
  }

  const signedPayload = `${timestamp}.${input.rawBody}`;
  const expected = createHmac('sha256', input.secret).update(signedPayload, 'utf8').digest('hex');
  if (!signatures.some((signature) => safeHexEqual(expected, signature))) {
    throw new Error('Stripe webhook signature verification failed');
  }
}

export function parseStripeEvent(rawBody: string): StripeEvent {
  const parsed = JSON.parse(rawBody) as Partial<StripeEvent>;
  if (
    typeof parsed.id !== 'string' ||
    typeof parsed.type !== 'string' ||
    typeof parsed.created !== 'number' ||
    !parsed.data ||
    typeof parsed.data !== 'object' ||
    !parsed.data.object ||
    typeof parsed.data.object !== 'object'
  ) {
    throw new Error('Invalid Stripe event payload');
  }
  return parsed as StripeEvent;
}
