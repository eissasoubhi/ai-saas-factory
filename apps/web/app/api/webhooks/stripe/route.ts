import {
  claimWebhookEvent,
  completeWebhookEvent,
  ensureStripeCustomer,
  failWebhookEvent,
  getOrganizationIdByStripeCustomer,
  syncStripeSubscription,
  writeAuditLog,
} from '@factory/db';
import {
  planForStripePrice,
  retrieveStripeSubscription,
  stripeSubscriptionPeriodEnd,
  stripeSubscriptionPriceId,
  type StripeSubscription,
} from '@/lib/stripe';
import { parseStripeEvent, verifyStripeWebhookSignature, type StripeEvent } from '@/lib/stripe-webhook';

export const runtime = 'nodejs';

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function expandableId(value: unknown): string | null {
  if (typeof value === 'string') return value;
  return stringValue(record(value)?.id);
}

function metadataValue(object: Record<string, unknown>, key: string) {
  return stringValue(record(object.metadata)?.[key]);
}

function asStripeSubscription(object: Record<string, unknown>): StripeSubscription | null {
  const id = stringValue(object.id);
  const customer = expandableId(object.customer);
  const status = stringValue(object.status);
  const items = record(object.items);
  if (!id || !customer || !status || !Array.isArray(items?.data)) return null;
  return object as unknown as StripeSubscription;
}

async function resolveOrganizationId(input: {
  metadataOrganizationId?: string | null;
  customerId: string;
}) {
  const mapped = await getOrganizationIdByStripeCustomer(input.customerId);
  if (mapped && input.metadataOrganizationId && mapped !== input.metadataOrganizationId) {
    throw new Error('Stripe customer organization mapping mismatch');
  }
  return input.metadataOrganizationId ?? mapped;
}

async function applySubscription(subscription: StripeSubscription, event: StripeEvent) {
  const metadataOrganizationId = subscription.metadata?.organizationId ?? null;
  const organizationId = await resolveOrganizationId({
    metadataOrganizationId,
    customerId: subscription.customer,
  });
  if (!organizationId) throw new Error(`Unable to resolve workspace for Stripe customer ${subscription.customer}`);

  const priceId = stripeSubscriptionPriceId(subscription);
  const plan = planForStripePrice(priceId);
  const result = await syncStripeSubscription({
    organizationId,
    customerId: subscription.customer,
    subscriptionId: subscription.id,
    priceId,
    plan,
    status: subscription.status,
    currentPeriodEnd: stripeSubscriptionPeriodEnd(subscription),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    providerUpdatedAt: new Date(event.created * 1000),
  });

  if (result.applied) {
    await writeAuditLog({
      organizationId,
      action: 'billing.subscription.synced',
      entityType: 'subscription',
      entityId: subscription.id,
      metadata: { eventId: event.id, eventType: event.type, status: subscription.status, plan },
    });
  }
}

function invoiceSubscriptionId(object: Record<string, unknown>) {
  const legacy = expandableId(object.subscription);
  if (legacy) return legacy;
  const parent = record(object.parent);
  const details = record(parent?.subscription_details);
  return expandableId(details?.subscription);
}

async function processEvent(event: StripeEvent) {
  const object = event.data.object;

  if (event.type === 'checkout.session.completed') {
    const customerId = expandableId(object.customer);
    const subscriptionId = expandableId(object.subscription);
    const organizationId = metadataValue(object, 'organizationId') ?? stringValue(object.client_reference_id);
    if (!customerId || !organizationId) throw new Error('Checkout session is missing customer/workspace mapping');
    await ensureStripeCustomer(organizationId, customerId);
    if (subscriptionId) await applySubscription(await retrieveStripeSubscription(subscriptionId), event);
    return;
  }

  if (
    event.type === 'customer.subscription.created' ||
    event.type === 'customer.subscription.updated' ||
    event.type === 'customer.subscription.deleted'
  ) {
    const subscription = asStripeSubscription(object);
    if (!subscription) throw new Error('Invalid Stripe subscription payload');
    await applySubscription(subscription, event);
    return;
  }

  if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
    const subscriptionId = invoiceSubscriptionId(object);
    if (subscriptionId) await applySubscription(await retrieveStripeSubscription(subscriptionId), event);
  }
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: 'Stripe webhook is not configured.' }, { status: 503 });

  const rawBody = await request.text();
  const signature = request.headers.get('stripe-signature');
  if (!signature) return Response.json({ error: 'Missing Stripe-Signature header.' }, { status: 400 });

  try {
    verifyStripeWebhookSignature({ rawBody, signatureHeader: signature, secret });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Invalid signature.' }, { status: 400 });
  }

  let event: StripeEvent;
  let payload: Record<string, unknown>;
  try {
    event = parseStripeEvent(rawBody);
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Invalid event.' }, { status: 400 });
  }

  const claim = await claimWebhookEvent({
    provider: 'stripe',
    providerEventId: event.id,
    eventType: event.type,
    payload,
  });

  if (claim.state === 'duplicate' || claim.state === 'busy' || !claim.id) {
    return Response.json({ received: true, duplicate: claim.state === 'duplicate' });
  }

  try {
    await processEvent(event);
    await completeWebhookEvent(claim.id);
    return Response.json({ received: true });
  } catch (error) {
    await failWebhookEvent(claim.id, error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Webhook processing failed.' },
      { status: 500 },
    );
  }
}
