import {
  getSubscriptionForOrganization,
  isClosedUsageCreditPeriod,
  listDispatchableStripeMeterSubmissionIds,
  reconcileClosedPeriodStripeMetering,
} from '@factory/db';
import { enqueueStripeMeterSubmission } from '@factory/jobs';
import { correlationIdFromHeaders, emitTelemetry } from '@factory/telemetry';
import { NextResponse } from 'next/server';
import { recordAuditEvent } from '@/lib/audit';
import { requireBillingManager } from '@/lib/organization-access';

function applicationBaseUrl(request: Request) {
  return process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? new URL(request.url).origin;
}

function redirectToUsage(request: Request, params: Record<string, string | number | boolean>) {
  const url = new URL('/settings/usage', applicationBaseUrl(request));
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request) {
  const correlationId = correlationIdFromHeaders(request.headers);
  const startedAt = Date.now();
  const access = await requireBillingManager(request.headers);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });

  const form = await request.formData();
  const periodKey = String(form.get('periodKey') ?? '').trim();
  if (!isClosedUsageCreditPeriod(periodKey)) {
    return redirectToUsage(request, { meteringError: 'period-must-be-closed' });
  }

  const eventName = process.env.STRIPE_AI_OVERAGE_METER_EVENT_NAME?.trim();
  if (!eventName) {
    return redirectToUsage(request, { meteringError: 'meter-event-not-configured' });
  }

  const { organization, session } = access.context;
  const subscription = await getSubscriptionForOrganization(organization.id);
  if (!subscription?.providerCustomerId) {
    return redirectToUsage(request, { meteringError: 'stripe-customer-not-configured' });
  }

  const result = await reconcileClosedPeriodStripeMetering({
    organizationId: organization.id,
    periodKey,
    providerCustomerId: subscription.providerCustomerId,
    eventName,
  });

  const dispatchable = await listDispatchableStripeMeterSubmissionIds({
    organizationId: organization.id,
    periodKey,
  });
  let queued = 0;
  let queueFailed = 0;
  for (const submission of dispatchable) {
    try {
      await enqueueStripeMeterSubmission({ submissionId: submission.id });
      queued += 1;
    } catch (error) {
      queueFailed += 1;
      emitTelemetry({
        name: 'web.billing.metering_enqueue_failed',
        level: 'error',
        component: 'web',
        correlationId,
        organizationId: organization.id,
        userId: session.user.id,
        attributes: { submissionId: submission.id, periodKey },
        error,
      });
    }
  }

  await recordAuditEvent({
    organizationId: organization.id,
    actorUserId: session.user.id,
    action: 'billing.metering_reconciled',
    entityType: 'billing_period',
    entityId: periodKey,
    correlationId,
    metadata: {
      allowanceMicros: result.allowanceMicros,
      settledCostMicros: result.settledCostMicros,
      overageMicros: result.overageMicros,
      overageAllowedForPeriod: result.overageAllowedForPeriod,
      createdSubmissions: result.createdSubmissionIds.length,
      queued,
      queueFailed,
    },
  });

  emitTelemetry({
    name: 'web.billing.metering_reconciled',
    component: 'web',
    correlationId,
    durationMs: Date.now() - startedAt,
    organizationId: organization.id,
    userId: session.user.id,
    attributes: {
      periodKey,
      createdSubmissions: result.createdSubmissionIds.length,
      queued,
      queueFailed,
      overageMicros: result.overageMicros,
    },
  });

  return redirectToUsage(request, {
    meteringPeriod: periodKey,
    meteringQueued: queued,
    meteringQueueFailed: queueFailed,
  });
}
