import {
  getOrganizationUsageOverview,
  getSubscriptionForOrganization,
  getUsageCreditBalance,
  paidPlanForSubscription,
  usageCreditPeriodKey,
} from '@factory/db';
import { aiCreditPolicy, entitlement } from '@factory/entitlements';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getActiveOrganizationContext } from '@/lib/organization-access';

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatUsdMicros(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(value / 1_000_000);
}

export default async function UsageSettingsPage() {
  const requestHeaders = new Headers(await headers());
  const context = await getActiveOrganizationContext(requestHeaders);
  if (!context) redirect('/dashboard');
  if (context.role !== 'owner' && context.role !== 'admin') redirect('/dashboard');

  const [usage, snapshot] = await Promise.all([
    getOrganizationUsageOverview(context.organization.id),
    getSubscriptionForOrganization(context.organization.id),
  ]);
  const plan = paidPlanForSubscription(snapshot);
  const requestLimit = entitlement(plan, 'ai_requests_monthly') as number;
  const creditPolicy = aiCreditPolicy(plan);
  const creditBalanceMicros = await getUsageCreditBalance(
    context.organization.id,
    usageCreditPeriodKey(),
  );
  const modelIds = [...new Set(usage.byModel.map((row) => row.modelId))];

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">{context.organization.name}</p>
          <h1 className="mt-2 text-4xl font-bold">AI usage</h1>
          <p className="mt-3 text-zinc-400">Current-month totals calculated from immutable workspace usage events and credit-ledger entries.</p>
        </div>
        <div className="flex gap-2">
          <Link className="rounded-lg border border-zinc-700 px-4 py-2 text-sm" href="/settings/audit">Audit log</Link>
          <Link className="rounded-lg border border-zinc-700 px-4 py-2 text-sm" href="/dashboard">Dashboard</Link>
        </div>
      </div>

      <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Requests" value={`${formatNumber(usage.requests)} / ${formatNumber(requestLimit)}`} />
        <Metric label="Credit balance" value={formatUsdMicros(creditBalanceMicros)} />
        <Metric label="Monthly allowance" value={formatUsdMicros(creditPolicy.includedMicros)} />
        <Metric label="Overage" value={creditPolicy.overageAllowed ? 'Allowed' : 'Blocked'} />
        <Metric label="Input tokens" value={formatNumber(usage.inputTokens)} />
        <Metric label="Output tokens" value={formatNumber(usage.outputTokens)} />
        <Metric label="Embedding tokens" value={formatNumber(usage.embeddingTokens)} />
        <Metric label="Estimated model cost" value={formatUsdMicros(usage.totalCostMicros)} />
      </section>

      <p className="mt-3 text-xs text-zinc-600">
        Monthly plan credits are granted lazily on the first AI request of the period. Before first use, the ledger balance can be zero while the plan allowance is still available.
      </p>

      <section className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">By model</h2>
            <p className="mt-1 text-sm text-zinc-500">Only metrics that recorded a model ID are attributed here.</p>
          </div>
          <span className="text-sm text-zinc-500">Since {usage.monthStart.toLocaleDateString('en-GB')}</span>
        </div>
        {modelIds.length === 0 ? (
          <p className="mt-6 text-sm text-zinc-500">No model-attributed usage yet this month.</p>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-zinc-500">
                <tr>
                  <th className="pb-3 pr-4 font-medium">Model</th>
                  <th className="pb-3 pr-4 font-medium">Requests</th>
                  <th className="pb-3 pr-4 font-medium">Input tokens</th>
                  <th className="pb-3 pr-4 font-medium">Output tokens</th>
                  <th className="pb-3 pr-4 font-medium">Embedding tokens</th>
                  <th className="pb-3 font-medium">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {modelIds.map((modelId) => {
                  const values = Object.fromEntries(
                    usage.byModel.filter((row) => row.modelId === modelId).map((row) => [row.metric, row.value]),
                  );
                  return (
                    <tr key={modelId}>
                      <td className="py-3 pr-4 font-mono text-xs">{modelId}</td>
                      <td className="py-3 pr-4">{formatNumber(values['ai.requests'] ?? 0)}</td>
                      <td className="py-3 pr-4">{formatNumber(values['ai.input_tokens'] ?? 0)}</td>
                      <td className="py-3 pr-4">{formatNumber(values['ai.output_tokens'] ?? 0)}</td>
                      <td className="py-3 pr-4">{formatNumber(values['ai.embedding_tokens'] ?? 0)}</td>
                      <td className="py-3">{formatUsdMicros(values['ai.cost_micros'] ?? 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
        <h2 className="text-xl font-semibold">Daily ledger</h2>
        {usage.daily.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">No usage events yet this month.</p>
        ) : (
          <div className="mt-4 max-h-96 overflow-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="sticky top-0 bg-zinc-950 text-zinc-500">
                <tr><th className="pb-2">UTC day</th><th className="pb-2">Metric</th><th className="pb-2 text-right">Quantity</th></tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {usage.daily.map((row) => (
                  <tr key={`${row.day}/${row.metric}`}>
                    <td className="py-2">{row.day}</td>
                    <td className="py-2 font-mono text-xs">{row.metric}</td>
                    <td className="py-2 text-right">{formatNumber(row.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="mt-2 break-words text-2xl font-semibold">{value}</p>
    </article>
  );
}
