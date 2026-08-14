import type { PlanId } from '@factory/contracts';

const STRIPE_API_BASE = 'https://api.stripe.com/v1';
const DEFAULT_API_VERSION = '2026-04-22.dahlia';

export type StripeCustomer = {
  id: string;
  email?: string | null;
  metadata?: Record<string, string>;
};

export type StripeCheckoutSession = {
  id: string;
  url: string | null;
  customer: string | null;
  subscription: string | null;
  client_reference_id?: string | null;
  metadata?: Record<string, string>;
};

export type StripePortalSession = {
  id: string;
  url: string;
};

export type StripeSubscription = {
  id: string;
  customer: string;
  status: string;
  cancel_at_period_end: boolean;
  metadata?: Record<string, string>;
  items: {
    data: Array<{
      current_period_end?: number;
      price?: { id?: string };
      plan?: { id?: string };
    }>;
  };
};

type StripeErrorBody = {
  error?: { message?: string; type?: string; code?: string };
};

function secretKey() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');
  return key;
}

function append(params: URLSearchParams, key: string, value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined) return;
  params.append(key, String(value));
}

async function stripePost<T>(path: string, params: URLSearchParams, idempotencyKey?: string): Promise<T> {
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': process.env.STRIPE_API_VERSION ?? DEFAULT_API_VERSION,
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: params,
    cache: 'no-store',
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as StripeErrorBody;
    const requestId = response.headers.get('request-id');
    const message = body.error?.message ?? `Stripe request failed with ${response.status}`;
    throw new Error(requestId ? `${message} (request ${requestId})` : message);
  }

  return (await response.json()) as T;
}

async function stripeGet<T>(path: string): Promise<T> {
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      'Stripe-Version': process.env.STRIPE_API_VERSION ?? DEFAULT_API_VERSION,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as StripeErrorBody;
    throw new Error(body.error?.message ?? `Stripe request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

export function stripePriceForPlan(plan: Exclude<PlanId, 'free'>) {
  const key = plan === 'starter' ? 'STRIPE_PRICE_STARTER' : 'STRIPE_PRICE_PRO';
  const price = process.env[key];
  if (!price) throw new Error(`${key} is not configured`);
  return price;
}

export function planForStripePrice(priceId: string | null | undefined): PlanId {
  if (priceId && priceId === process.env.STRIPE_PRICE_STARTER) return 'starter';
  if (priceId && priceId === process.env.STRIPE_PRICE_PRO) return 'pro';
  return 'free';
}

export async function createStripeCustomer(input: {
  organizationId: string;
  organizationName: string;
  email: string;
}) {
  const params = new URLSearchParams();
  append(params, 'email', input.email);
  append(params, 'name', input.organizationName);
  append(params, 'metadata[organizationId]', input.organizationId);
  return stripePost<StripeCustomer>(
    '/customers',
    params,
    `customer/${input.organizationId}`,
  );
}

export async function createStripeCheckout(input: {
  organizationId: string;
  customerId: string;
  plan: Exclude<PlanId, 'free'>;
  baseUrl: string;
}) {
  const params = new URLSearchParams();
  append(params, 'mode', 'subscription');
  append(params, 'customer', input.customerId);
  append(params, 'client_reference_id', input.organizationId);
  append(params, 'line_items[0][price]', stripePriceForPlan(input.plan));
  append(params, 'line_items[0][quantity]', 1);
  append(params, 'allow_promotion_codes', true);
  append(params, 'success_url', `${input.baseUrl}/settings/billing?checkout=success`);
  append(params, 'cancel_url', `${input.baseUrl}/settings/billing?checkout=cancelled`);
  append(params, 'metadata[organizationId]', input.organizationId);
  append(params, 'metadata[plan]', input.plan);
  append(params, 'subscription_data[metadata][organizationId]', input.organizationId);
  append(params, 'subscription_data[metadata][plan]', input.plan);

  return stripePost<StripeCheckoutSession>(
    '/checkout/sessions',
    params,
    `checkout/${input.organizationId}/${input.plan}`,
  );
}

export async function createStripePortal(input: { customerId: string; baseUrl: string }) {
  const params = new URLSearchParams();
  append(params, 'customer', input.customerId);
  append(params, 'return_url', `${input.baseUrl}/settings/billing`);
  return stripePost<StripePortalSession>('/billing_portal/sessions', params);
}

export async function retrieveStripeSubscription(subscriptionId: string) {
  return stripeGet<StripeSubscription>(`/subscriptions/${encodeURIComponent(subscriptionId)}`);
}

export function stripeSubscriptionPriceId(subscription: StripeSubscription) {
  const item = subscription.items.data[0];
  return item?.price?.id ?? item?.plan?.id ?? null;
}

export function stripeSubscriptionPeriodEnd(subscription: StripeSubscription) {
  const ends = subscription.items.data
    .map((item) => item.current_period_end)
    .filter((value): value is number => typeof value === 'number');
  if (ends.length === 0) return null;
  return new Date(Math.max(...ends) * 1000);
}
