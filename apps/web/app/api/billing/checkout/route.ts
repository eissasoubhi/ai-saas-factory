import { ensureStripeCustomer, getSubscriptionForOrganization } from '@factory/db';
import { NextResponse } from 'next/server';
import { requireBillingManager } from '@/lib/organization-access';
import { createStripeCheckout, createStripeCustomer } from '@/lib/stripe';

function applicationBaseUrl(request: Request) {
  return process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? new URL(request.url).origin;
}

function hasManageableExistingSubscription(status: string) {
  return status !== 'canceled' && status !== 'incomplete_expired' && status !== 'inactive';
}

export async function POST(request: Request) {
  const access = await requireBillingManager(request.headers);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });

  const form = await request.formData();
  const rawPlan = form.get('plan');
  if (rawPlan !== 'starter' && rawPlan !== 'pro') {
    return Response.json({ error: 'Invalid billing plan.' }, { status: 400 });
  }

  const { organization, session } = access.context;
  let snapshot = await getSubscriptionForOrganization(organization.id);

  if (snapshot?.providerSubscriptionId && hasManageableExistingSubscription(snapshot.status)) {
    return NextResponse.redirect(new URL('/settings/billing?error=manage-existing-subscription', applicationBaseUrl(request)), 303);
  }

  let customerId = snapshot?.providerCustomerId ?? null;
  if (!customerId) {
    const customer = await createStripeCustomer({
      organizationId: organization.id,
      organizationName: organization.name,
      email: session.user.email,
    });
    customerId = customer.id;
    snapshot = (await ensureStripeCustomer(organization.id, customerId)) ?? snapshot;
  }

  const checkout = await createStripeCheckout({
    organizationId: organization.id,
    customerId,
    plan: rawPlan,
    baseUrl: applicationBaseUrl(request),
  });

  if (!checkout.url) {
    return Response.json({ error: 'Stripe did not return a Checkout URL.' }, { status: 502 });
  }

  return NextResponse.redirect(checkout.url, 303);
}