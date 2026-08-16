import { listAuditLogsForOrganization } from '@factory/db';
import { sanitizeTelemetryAttributes } from '@factory/telemetry';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getActiveOrganizationContext } from '@/lib/organization-access';

function queryString(input: {
  cursor?: string | null | undefined;
  action?: string | undefined;
  entityType?: string | undefined;
}) {
  const query = new URLSearchParams();
  if (input.cursor) query.set('cursor', input.cursor);
  if (input.action) query.set('action', input.action);
  if (input.entityType) query.set('entityType', input.entityType);
  return query.toString();
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string; action?: string; entityType?: string }>;
}) {
  const requestHeaders = new Headers(await headers());
  const context = await getActiveOrganizationContext(requestHeaders);
  if (!context) redirect('/dashboard');
  if (context.role !== 'owner' && context.role !== 'admin') redirect('/dashboard');

  const params = await searchParams;
  const page = await listAuditLogsForOrganization({
    organizationId: context.organization.id,
    limit: 50,
    ...(params.cursor ? { cursor: params.cursor } : {}),
    ...(params.action ? { action: params.action } : {}),
    ...(params.entityType ? { entityType: params.entityType } : {}),
  });

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">{context.organization.name}</p>
          <h1 className="mt-2 text-4xl font-bold">Audit log</h1>
          <p className="mt-3 text-zinc-400">Bounded, tenant-scoped operational events for this workspace.</p>
        </div>
        <div className="flex gap-2">
          <Link className="rounded-lg border border-zinc-700 px-4 py-2 text-sm" href="/settings/usage">AI usage</Link>
          <Link className="rounded-lg border border-zinc-700 px-4 py-2 text-sm" href="/dashboard">Dashboard</Link>
        </div>
      </div>

      <form className="mt-8 grid gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-5 md:grid-cols-[1fr_1fr_auto]" method="get">
        <label className="text-sm text-zinc-400">
          Action
          <input
            className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100"
            name="action"
            defaultValue={params.action ?? ''}
            maxLength={100}
            placeholder="file.deleted"
          />
        </label>
        <label className="text-sm text-zinc-400">
          Entity type
          <input
            className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100"
            name="entityType"
            defaultValue={params.entityType ?? ''}
            maxLength={100}
            placeholder="file"
          />
        </label>
        <button className="self-end rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black" type="submit">Filter</button>
      </form>

      <section className="mt-6 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
        {page.items.length === 0 ? (
          <p className="p-8 text-sm text-zinc-500">No matching audit events.</p>
        ) : (
          <div className="divide-y divide-zinc-800">
            {page.items.map((item) => {
              const safeMetadata = sanitizeTelemetryAttributes(item.metadata ?? undefined);
              return (
                <article key={item.id} className="grid gap-4 p-5 lg:grid-cols-[190px_minmax(0,1fr)_220px]">
                  <div>
                    <p className="text-sm text-zinc-300">{item.createdAt.toLocaleString('en-GB')}</p>
                    <p className="mt-1 text-xs text-zinc-600">{item.actorEmail ?? item.actorUserId ?? 'system'}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium">{item.action}</p>
                    <p className="mt-1 text-xs text-zinc-500">{item.entityType}{item.entityId ? ` · ${item.entityId}` : ''}</p>
                    {safeMetadata && Object.keys(safeMetadata).length > 0 ? (
                      <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-zinc-900 p-3 text-xs text-zinc-400">{JSON.stringify(safeMetadata, null, 2)}</pre>
                    ) : null}
                  </div>
                  <p className="break-all text-xs text-zinc-600">{item.id}</p>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <div className="mt-6 flex justify-end">
        {page.nextCursor ? (
          <Link
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm"
            href={`/settings/audit?${queryString({ cursor: page.nextCursor, action: params.action, entityType: params.entityType })}`}
          >
            Older events
          </Link>
        ) : (
          <span className="text-sm text-zinc-600">End of audit history</span>
        )}
      </div>
    </main>
  );
}
