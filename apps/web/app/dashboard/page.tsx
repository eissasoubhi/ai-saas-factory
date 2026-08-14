import { getMonthlyUsage, getOrganizationSeatUsage, getSubscriptionForOrganization, paidPlanForSubscription } from '@factory/db';
import { entitlement } from '@factory/entitlements';
import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { EnsureActiveOrganization } from '@/components/ensure-active-organization';
import { SignOutButton } from '@/components/sign-out-button';
import { auth } from '@/lib/auth';

export default async function DashboardPage() {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) redirect('/sign-in');

  const organizations = await auth.api.listOrganizations({ headers: requestHeaders });
  if (organizations.length === 0) redirect('/onboarding');

  const active = organizations.find((org) => org.id === session.session.activeOrganizationId) ?? organizations[0];
  if (!active) redirect('/onboarding');

  if (!session.session.activeOrganizationId) {
    return <EnsureActiveOrganization organizationId={active.id} />;
  }

  const [snapshot, seatUsage, monthlyAiRequests] = await Promise.all([
    getSubscriptionForOrganization(active.id),
    getOrganizationSeatUsage(active.id),
    getMonthlyUsage(active.id, 'ai.requests'),
  ]);
  const plan = paidPlanForSubscription(snapshot);

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-16">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-zinc-500">{active.name}</p>
          <h1 className="mt-2 text-4xl font-bold">Dashboard</h1>
          <p className="mt-2 text-sm text-zinc-500">Signed in as {session.user.email}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link className="rounded-lg border border-zinc-700 px-3 py-2 text-sm" href="/settings/team">Team</Link>
          <Link className="rounded-lg border border-zinc-700 px-3 py-2 text-sm" href="/settings/billing">Billing</Link>
          <span className="rounded-full border border-zinc-700 px-4 py-2 text-sm capitalize">{plan}</span>
          <SignOutButton />
        </div>
      </div>

      <section className="mt-10 grid gap-4 md:grid-cols-3">
        <Metric label="AI requests" value={`${monthlyAiRequests} / ${entitlement(plan, 'ai_requests_monthly')}`} />
        <Metric label="Team seats" value={`${seatUsage.members} / ${entitlement(plan, 'team_members')}`} />
        <Metric label="Audit retention" value={`${entitlement(plan, 'audit_log_days')} days`} />
      </section>

      <section className="mt-10 rounded-2xl border border-zinc-800 p-8">
        <h2 className="text-xl font-semibold">Workspace access is entitlement-driven</h2>
        <p className="mt-3 max-w-2xl text-zinc-400">The dashboard now resolves its plan from server-side subscription state synchronized by verified Stripe webhooks. Browser redirects never grant paid access.</p>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-2xl border border-zinc-800 p-6">
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold">{value}</p>
    </article>
  );
}