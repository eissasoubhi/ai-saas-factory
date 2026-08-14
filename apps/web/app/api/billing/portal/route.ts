import { getSubscriptionForOrganization } from '@factory/db';
import { NextResponse } from 'next/server';
import { requireBillingManager } from '@/lib/organization-access';
import { createStripePortal } from '@/lib/stripe';

function applicationBaseUrl(request: Request) {
  return process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? new URL(request.url).origin;
}

export async function POST(request: Request) {
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
  return NextResponse.redirect(portal.url, 303);
}
