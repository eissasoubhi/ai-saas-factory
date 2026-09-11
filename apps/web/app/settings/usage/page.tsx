import {
  getOrganizationUsageOverview,
  getSubscriptionForOrganization,
  getUsageCreditBalance,
  listStripeMeterSubmissionsForOrganization,
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

function previousUtcPeriodKey(now = new Date()) {
  return usageCreditPeriodKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));
}

function meteringNotice(params: {
  meteringPeriod?: string;
  meteringQueued?: string;
  meteringQueueFailed?: string;
  meteringRetryQueued?: string;
  meteringError?: string;
}) {
  if (params.meteringError) return `Metering action failed: ${params.meteringError}.`;
  if (params.meteringRetryQueued) return 'Stripe meter submission retry queued.';
  if (params.meteringPeriod) {
    return `Reconciled ${params.meteringPeriod}: ${params.meteringQueued ?? '0'} queued, ${params.meteringQueueFailed ?? '0'} queue failures.`;
  }
  return null;
}

export default async function UsageSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    meteringPeriod?: string;
    meteringQueued?: string;
    meteringQueueFailed?: string;
    meteringRetryQueued?: string;
    meteringError?: string;
  }>;
}) {
  const requestHeaders = new Headers(await headers());
  const context = await getActiveOrganizationContext(requestHeaders);
  if (!context) redirect('/dashboard');
  if (context.role !== 'owner' && context.role !== 'admin') redirect('/dashboard');

  const params = await searchParams;
  const [usage, snapshot, meterSubmissions] = await Promise.all([
    getOrganizationUsageOverview(context.organization.id),
    getSubscriptionForOrganization(context.organization.id),
    listStripeMeterSubmissionsForOrganization({ organizationId: context.organization.id, limit: 50 }),
  ]);
  const plan = paidPlanForSubscription(snapshot);
  const requestLimit = entitlement(plan, 'ai_requests_monthly') as number;
  const creditPolicy = aiCreditPolicy(plan);
  const creditBalanceMicros = await getUsageCreditBalance(
    context.organization.id,
    usageCreditPeriodKey(),
  );
  const modelIds = [...new Set(usage.byModel.map((row) => row.modelId))];
  const notice = meteringNotice(params);
  const defaultClosedPeriod = previousUtcPeriodKey();

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

      {notice ? (
        <p className="mt-6 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-300">{notice}</p>
      ) : null}

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
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <h2 className="text-xl font-semibold">Stripe metered overage</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Reconciliation is limited to closed UTC months. Only months whose immutable ledger contains a Pro plan grant can create billable overage submissions.
            </p>
          </div>
          <form className="flex flex-wrap items-end gap-2" action="/api/billing/metering/reconcile" method="post">
            <label className="text-xs text-zinc-500">
              Closed month
              <input
                className="mt-1 block rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                type="month"
                name="periodKey"
                defaultValue={defaultClosedPeriod}
                max={defaultClosedPeriod}
                required
              />
            </label>
            <button className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black" type="submit">
              Reconcile & queue
            </button>
          </form>
        </div>

        {meterSubmissions.length === 0 ? (
          <p className="mt-6 text-sm text-zinc-500">No Stripe meter submissions have been created for this workspace.</p>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="text-zinc-500">
                <tr>
                  <th className="pb-3 pr-4 font-medium">Period</th>
                  <th className="pb-3 pr-4 font-medium">Value</th>
                  <th className="pb-3 pr-4 font-medium">Status</th>
                  <th className="pb-3 pr-4 font-medium">Attempts</th>
                  <th className="pb-3 pr-4 font-medium">Meter timestamp</th>
                  <th className="pb-3 pr-4 font-medium">Last error</th>
                  <th className="pb-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {meterSubmissions.map((submission) => (
                  <tr key={submission.id}>
                    <td className="py-3 pr-4 font-mono text-xs">{submission.periodKey}</td>
                    <td className="py-3 pr-4">{formatUsdMicros(submission.valueMicros)}</td>
                    <td className="py-3 pr-4">{submission.status}</td>
                    <td className="py-3 pr-4">{submission.attemptCount}</td>
                    <td className="py-3 pr-4 text-xs text-zinc-400">{submission.meteredAt.toISOString()}</td>
                    <td className="max-w-sm truncate py-3 pr-4 text-xs text-zinc-500" title={submission.lastError ?? undefined}>
                      {submission.lastError ?? '—'}
                    </td>
                    <td className="py-3">
                      {submission.status === 'failed' || submission.status === 'dead' ? (
                        <form action="/api/billing/metering/retry" method="post">
                          <input type="hidden" name="submissionId" value={submission.id} />
                          <button className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs" type="submit">Retry</button>
                        </form>
                      ) : (
                        <span className="text-xs text-zinc-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

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
