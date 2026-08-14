import {
  getMonthlyUsage,
  getOrganizationSeatUsage,
  getSubscriptionForOrganization,
  paidPlanForSubscription,
} from '@factory/db';
import { entitlement } from '@factory/entitlements';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getActiveOrganizationContext } from '@/lib/organization-access';

export default async function BillingSettingsPage() {
  const requestHeaders = new Headers(await headers());
  const context = await getActiveOrganizationContext(requestHeaders);
  if (!context) redirect('/dashboard');

  const [snapshot, seatUsage, monthlyAiRequests] = await Promise.all([
    getSubscriptionForOrganization(context.organization.id),
    getOrganizationSeatUsage(context.organization.id),
    getMonthlyUsage(context.organization.id, 'ai.requests'),
  ]);
  const plan = paidPlanForSubscription(snapshot);
  const canManage = context.role === 'owner' || context.role === 'admin';
  const teamLimit = entitlement(plan, 'team_members');
  const aiLimit = entitlement(plan, 'ai_requests_monthly');

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">{context.organization.name}</p>
          <h1 className="mt-2 text-4xl font-bold">Billing</h1>
          <p className="mt-3 text-zinc-400">Subscription state comes from verified Stripe webhooks, not from the browser redirect.</p>
        </div>
        <Link className="rounded-lg border border-zinc-700 px-4 py-2 text-sm" href="/dashboard">Back to dashboard</Link>
      </div>

      <section className="mt-10 grid gap-4 md:grid-cols-3">
        <Card label="Effective plan" value={plan} />
        <Card label="Provider status" value={snapshot?.status ?? 'inactive'} />
        <Card
          label="Current period"
          value={snapshot?.currentPeriodEnd ? snapshot.currentPeriodEnd.toLocaleDateString('en-GB') : '—'}
        />
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <Card label="Seats" value={`${seatUsage.members} / ${teamLimit}`} detail={`${seatUsage.pendingInvitations} pending invitation(s)`} />
        <Card label="AI requests this month" value={`${monthlyAiRequests} / ${aiLimit}`} />
      </section>

      <section className="mt-10 rounded-2xl border border-zinc-800 p-6">
        <h2 className="text-xl font-semibold">Manage subscription</h2>
        {!canManage ? (
          <p className="mt-3 text-sm text-zinc-400">Only workspace owners and admins can change billing.</p>
        ) : (
          <div className="mt-5 flex flex-wrap gap-3">
            {plan === 'free' ? (
              <>
                <CheckoutButton plan="starter" label="Start Starter" />
                <CheckoutButton plan="pro" label="Start Pro" />
              </>
            ) : null}
            {snapshot?.providerCustomerId ? (
              <form method="post" action="/api/billing/portal">
                <button className="rounded-lg border border-zinc-600 px-4 py-2 text-sm font-semibold" type="submit">
                  Open customer portal
                </button>
              </form>
            ) : null}
          </div>
        )}
        {snapshot?.cancelAtPeriodEnd ? (
          <p className="mt-4 text-sm text-amber-300">Cancellation is scheduled for the end of the current billing period.</p>
        ) : null}
        {snapshot && snapshot.plan !== 'free' && plan === 'free' ? (
          <p className="mt-4 text-sm text-amber-300">Paid entitlements are paused because the subscription is {snapshot.status}. Use the portal to resolve billing.</p>
        ) : null}
      </section>
    </main>
  );
}

function CheckoutButton({ plan, label }: { plan: 'starter' | 'pro'; label: string }) {
  return (
    <form method="post" action="/api/billing/checkout">
      <input type="hidden" name="plan" value={plan} />
      <button className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black" type="submit">{label}</button>
    </form>
  );
}

function Card({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold capitalize">{value}</p>
      {detail ? <p className="mt-2 text-sm text-zinc-500">{detail}</p> : null}
    </div>
  );
}
