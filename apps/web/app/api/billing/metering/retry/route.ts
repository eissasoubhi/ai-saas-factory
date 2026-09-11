import { resetStripeMeterSubmissionForRetry } from '@factory/db';
import { enqueueStripeMeterSubmission } from '@factory/jobs';
import { correlationIdFromHeaders, emitTelemetry } from '@factory/telemetry';
import { NextResponse } from 'next/server';
import { recordAuditEvent } from '@/lib/audit';
import { requireBillingManager } from '@/lib/organization-access';

function applicationBaseUrl(request: Request) {
  return process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? new URL(request.url).origin;
}

function redirectToUsage(request: Request, params: Record<string, string | number>) {
  const url = new URL('/settings/usage', applicationBaseUrl(request));
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request) {
  const correlationId = correlationIdFromHeaders(request.headers);
  const access = await requireBillingManager(request.headers);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });

  const form = await request.formData();
  const submissionId = String(form.get('submissionId') ?? '').trim();
  if (!submissionId) return redirectToUsage(request, { meteringError: 'missing-submission' });

  const { organization, session } = access.context;
  const reset = await resetStripeMeterSubmissionForRetry({
    organizationId: organization.id,
    submissionId,
  });
  if (!reset) return redirectToUsage(request, { meteringError: 'submission-not-retryable' });

  try {
    await enqueueStripeMeterSubmission({ submissionId });
  } catch (error) {
    emitTelemetry({
      name: 'web.billing.metering_retry_enqueue_failed',
      level: 'error',
      component: 'web',
      correlationId,
      organizationId: organization.id,
      userId: session.user.id,
      attributes: { submissionId },
      error,
    });
    return redirectToUsage(request, { meteringError: 'retry-enqueue-failed' });
  }

  await recordAuditEvent({
    organizationId: organization.id,
    actorUserId: session.user.id,
    action: 'billing.metering_retry_queued',
    entityType: 'stripe_meter_submission',
    entityId: submissionId,
    correlationId,
  });

  emitTelemetry({
    name: 'web.billing.metering_retry_queued',
    component: 'web',
    correlationId,
    organizationId: organization.id,
    userId: session.user.id,
    attributes: { submissionId },
  });

  return redirectToUsage(request, { meteringRetryQueued: 1 });
}
