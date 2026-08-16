import {
  claimWebhookEvent,
  completeWebhookEvent,
  ensureStripeCustomer,
  failWebhookEvent,
  getOrganizationIdByStripeCustomer,
  syncStripeSubscription,
  writeAuditLog,
} from '@factory/db';
import { emitTelemetry } from '@factory/telemetry';
import { publishOutboundWebhookEvent } from '@/lib/outbound-events';
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
  const currentPeriodEnd = stripeSubscriptionPeriodEnd(subscription);
  const result = await syncStripeSubscription({
    organizationId,
    customerId: subscription.customer,
    subscriptionId: subscription.id,
    priceId,
    plan,
    status: subscription.status,
    currentPeriodEnd,
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
    void publishOutboundWebhookEvent({
      organizationId,
      type: 'billing.subscription.updated',
      eventId: `evt_billing_${event.id}`,
      occurredAt: new Date(event.created * 1000),
      correlationId: event.id,
      data: {
        subscriptionId: subscription.id,
        plan,
        status: subscription.status,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        currentPeriodEnd: currentPeriodEnd?.toISOString() ?? null,
      },
    }).catch((error) => {
      emitTelemetry({
        name: 'web.outbound_webhook.publish_failed',
        level: 'error',
        component: 'web',
        correlationId: event.id,
        organizationId,
        attributes: { eventId: `evt_billing_${event.id}`, eventType: 'billing.subscription.updated' },
        error,
      });
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

async function applyAuthoritativeSubscription(subscriptionId: string, event: StripeEvent) {
  const current = await retrieveStripeSubscription(subscriptionId);
  await applySubscription(current, event);
}

async function processEvent(event: StripeEvent) {
  const object = event.data.object;

  if (event.type === 'checkout.session.completed') {
    const customerId = expandableId(object.customer);
    const subscriptionId = expandableId(object.subscription);
    const organizationId = metadataValue(object, 'organizationId') ?? stringValue(object.client_reference_id);
    if (!customerId || !organizationId) throw new Error('Checkout session is missing customer/workspace mapping');
    await ensureStripeCustomer(organizationId, customerId);
    if (subscriptionId) await applyAuthoritativeSubscription(subscriptionId, event);
    return;
  }

  if (
    event.type === 'customer.subscription.created' ||
    event.type === 'customer.subscription.updated' ||
    event.type === 'customer.subscription.deleted'
  ) {
    const subscriptionId = stringValue(object.id);
    if (!subscriptionId) throw new Error('Stripe subscription event is missing the subscription ID');
    await applyAuthoritativeSubscription(subscriptionId, event);
    return;
  }

  if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
    const subscriptionId = invoiceSubscriptionId(object);
    if (subscriptionId) await applyAuthoritativeSubscription(subscriptionId, event);
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
