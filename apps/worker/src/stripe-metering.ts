import {
  claimStripeMeterSubmission,
  markStripeMeterSubmissionFailed,
  markStripeMeterSubmissionSent,
} from '@factory/db';
import { StripeMeterSubmissionJobSchema } from '@factory/jobs';
import { emitTelemetry } from '@factory/telemetry';

const STRIPE_API_BASE = 'https://api.stripe.com/v1';
const DEFAULT_API_VERSION = '2026-04-22.dahlia';
const STRIPE_REQUEST_TIMEOUT_MS = 15_000;

function stripeSecretKey() {
  const value = process.env.STRIPE_SECRET_KEY?.trim();
  if (!value) throw new Error('STRIPE_SECRET_KEY is not configured for meter submission');
  return value;
}

async function sendStripeMeterEvent(input: {
  eventName: string;
  providerCustomerId: string;
  valueMicros: number;
  providerIdentifier: string;
  meteredAt: Date;
}) {
  if (!Number.isSafeInteger(input.valueMicros) || input.valueMicros <= 0) {
    throw new Error('Stripe meter value must be a positive safe integer');
  }

  const params = new URLSearchParams();
  params.set('event_name', input.eventName);
  params.set('payload[stripe_customer_id]', input.providerCustomerId);
  params.set('payload[value]', String(input.valueMicros));
  params.set('identifier', input.providerIdentifier);
  params.set('timestamp', String(Math.floor(input.meteredAt.getTime() / 1000)));

  const response = await fetch(`${STRIPE_API_BASE}/billing/meter_events`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeSecretKey()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': process.env.STRIPE_API_VERSION ?? DEFAULT_API_VERSION,
      'Idempotency-Key': `meter/${input.providerIdentifier}`,
    },
    body: params,
    signal: AbortSignal.timeout(STRIPE_REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    const requestId = response.headers.get('request-id');
    const message = body.error?.message ?? `Stripe meter request failed with ${response.status}`;
    throw new Error(requestId ? `${message} (request ${requestId})` : message);
  }
}

export async function processStripeMeterSubmission(data: unknown, correlationId: string) {
  const payload = StripeMeterSubmissionJobSchema.parse(data);
  const claim = await claimStripeMeterSubmission(payload.submissionId);
  if (claim.state !== 'claimed' || !claim.submission) {
    emitTelemetry({
      name: 'worker.stripe_meter.skipped',
      component: 'worker',
      correlationId,
      attributes: { submissionId: payload.submissionId, state: claim.state },
    });
    return claim.state;
  }

  const submission = claim.submission;
  const startedAt = Date.now();
  try {
    await sendStripeMeterEvent({
      eventName: submission.eventName,
      providerCustomerId: submission.providerCustomerId,
      valueMicros: submission.valueMicros,
      providerIdentifier: submission.providerIdentifier,
      meteredAt: submission.meteredAt,
    });
    await markStripeMeterSubmissionSent(submission.id);
    emitTelemetry({
      name: 'worker.stripe_meter.sent',
      component: 'worker',
      correlationId,
      durationMs: Date.now() - startedAt,
      organizationId: submission.organizationId,
      attributes: {
        submissionId: submission.id,
        periodKey: submission.periodKey,
        valueMicros: submission.valueMicros,
        attemptCount: submission.attemptCount,
      },
    });
    return 'sent' as const;
  } catch (error) {
    await markStripeMeterSubmissionFailed(submission.id, error);
    emitTelemetry({
      name: 'worker.stripe_meter.failed',
      level: 'error',
      component: 'worker',
      correlationId,
      durationMs: Date.now() - startedAt,
      organizationId: submission.organizationId,
      attributes: {
        submissionId: submission.id,
        periodKey: submission.periodKey,
        valueMicros: submission.valueMicros,
        attemptCount: submission.attemptCount,
      },
      error,
    });
    throw error;
  }
}

export async function processStripeMeterSubmissionDeadLetter(data: unknown, correlationId: string) {
  const parsed = StripeMeterSubmissionJobSchema.safeParse(data);
  if (!parsed.success) return;
  await markStripeMeterSubmissionFailed(
    parsed.data.submissionId,
    new Error('Stripe meter submission exhausted durable retries'),
    true,
  );
  emitTelemetry({
    name: 'worker.stripe_meter.dead',
    level: 'error',
    component: 'worker',
    correlationId,
    attributes: { submissionId: parsed.data.submissionId },
  });
}
