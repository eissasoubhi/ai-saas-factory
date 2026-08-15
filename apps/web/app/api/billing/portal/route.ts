import { getSubscriptionForOrganization } from '@factory/db';
import { correlationIdFromHeaders, emitTelemetry } from '@factory/telemetry';
import { NextResponse } from 'next/server';
import { recordAuditEvent } from '@/lib/audit';
import { requireBillingManager } from '@/lib/organization-access';
import { createStripePortal } from '@/lib/stripe';

function applicationBaseUrl(request: Request) {
  return process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? new URL(request.url).origin;
}

export async function POST(request: Request) {
  const correlationId = correlationIdFromHeaders(request.headers);
  const startedAt = Date.now();
  const access = await requireBillingManager(request.headers);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });

  const snapshot = await getSubscriptionForOrganization(access.context.organization.id);
  if (!snapshot?.providerCustomerId) {
    return Response.json({ error: 'This workspace does not have a Stripe customer yet.' }, { status: 409 });
  }

  const portal = await createStripePortal({
    customerId: snapshot.providerCustomerId,
    baseUrl: applicationBaseUrl(request),
  });
  await recordAuditEvent({
    organizationId: access.context.organization.id,
    actorUserId: access.context.session.user.id,
    action: 'billing.portal_opened',
    entityType: 'subscription',
    entityId: snapshot.id,
    metadata: { provider: 'stripe', status: snapshot.status, plan: snapshot.plan },
    correlationId,
  });
  emitTelemetry({
    name: 'web.billing.portal_opened',
    component: 'web',
    correlationId,
    durationMs: Date.now() - startedAt,
    organizationId: access.context.organization.id,
    userId: access.context.session.user.id,
    attributes: { provider: 'stripe', status: snapshot.status, plan: snapshot.plan },
  });
  return NextResponse.redirect(portal.url, 303);
}
