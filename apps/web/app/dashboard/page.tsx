import { entitlement } from '@factory/entitlements';

export default function DashboardPage() {
  const plan = 'starter' as const;
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-16">
      <div className="flex items-end justify-between gap-6">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-zinc-500">Acme workspace</p>
          <h1 className="mt-2 text-4xl font-bold">Dashboard</h1>
        </div>
        <span className="rounded-full border border-zinc-700 px-4 py-2 text-sm capitalize">{plan}</span>
      </div>

      <section className="mt-10 grid gap-4 md:grid-cols-3">
        <Metric label="AI requests" value={`0 / ${entitlement(plan, 'ai_requests_monthly')}`} />
        <Metric label="Team seats" value={`1 / ${entitlement(plan, 'team_members')}`} />
        <Metric label="Audit retention" value={`${entitlement(plan, 'audit_log_days')} days`} />
      </section>

      <section className="mt-10 rounded-2xl border border-dashed border-zinc-700 p-8">
        <h2 className="text-xl font-semibold">V0.2 onboarding target</h2>
        <p className="mt-3 max-w-2xl text-zinc-400">This shell will become the authenticated organization dashboard after sign-in, billing and onboarding are wired.</p>
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
