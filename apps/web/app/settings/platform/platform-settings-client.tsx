'use client';

import { API_KEY_SCOPES } from '@factory/platform-security/constants';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { OUTBOUND_WEBHOOK_EVENT_TYPES } from '@/lib/outbound-event-types';

type ApiKeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
};

type WebhookEndpointRow = {
  id: string;
  name: string;
  url: string;
  status: string;
  eventTypes: string[];
  lastDeliveryAt: string | null;
  createdAt: string;
};

type DeliveryRow = {
  id: string;
  endpointId: string;
  endpointName: string;
  eventId: string;
  eventType: string;
  status: string;
  attemptCount: number;
  responseStatus: number | null;
  lastError: string | null;
  lastAttemptAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
};

type JsonObject = Record<string, unknown>;

function responseError(body: unknown, fallback: string) {
  if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') return body.error;
  return fallback;
}

async function requestJson<T extends JsonObject = JsonObject>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body: unknown = response.status === 204 ? {} : await response.json().catch(() => null);
  if (!response.ok) throw new Error(responseError(body, `Request failed with HTTP ${response.status}`));
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {} as T;
  return body as T;
}

export function PlatformSettingsClient({
  apiKeys,
  endpoints,
  deliveries,
}: {
  apiKeys: ApiKeyRow[];
  endpoints: WebhookEndpointRow[];
  deliveries: DeliveryRow[];
}) {
  const router = useRouter();
  const [apiSecret, setApiSecret] = useState<string | null>(null);
  const [webhookSecret, setWebhookSecret] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await action();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The operation failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-10">
      {notice ? <p className="rounded-xl border border-amber-900 bg-amber-950/40 p-4 text-sm text-amber-200">{notice}</p> : null}

      {apiSecret ? (
        <section className="rounded-2xl border border-emerald-800 bg-emerald-950/30 p-5">
          <p className="font-semibold text-emerald-200">Copy this API key now. It will not be shown again.</p>
          <code className="mt-3 block overflow-x-auto rounded-lg bg-black/40 p-3 text-sm text-emerald-100">{apiSecret}</code>
          <button className="mt-3 text-sm underline" type="button" onClick={() => setApiSecret(null)}>I saved it</button>
        </section>
      ) : null}

      <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
        <h2 className="text-2xl font-semibold">Organization API keys</h2>
        <p className="mt-2 text-sm text-zinc-400">Keys are hashed at rest. Use them as <code>Authorization: Bearer ...</code>.</p>

        <form
          className="mt-6 grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            void run(async () => {
              const data = new FormData(form);
              const expires = String(data.get('expiresInDays') ?? '');
              const result = await requestJson<{ secret: string }>('/api/platform/api-keys', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  name: String(data.get('name') ?? ''),
                  scopes: data.getAll('scopes').map(String),
                  expiresInDays: expires ? Number(expires) : null,
                }),
              });
              setApiSecret(result.secret);
              form.reset();
              router.refresh();
            });
          }}
        >
          <div className="grid gap-3 md:grid-cols-[1fr_180px]">
            <input className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2" name="name" maxLength={80} required placeholder="Production integration" />
            <select className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2" name="expiresInDays" defaultValue="">
              <option value="">No expiry</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="365">1 year</option>
            </select>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {API_KEY_SCOPES.map((scope) => (
              <label key={scope} className="flex items-center gap-2 rounded-lg border border-zinc-800 px-3 py-2 text-sm">
                <input type="checkbox" name="scopes" value={scope} defaultChecked={scope === 'files:read'} /> {scope}
              </label>
            ))}
          </div>
          <button type="submit" disabled={busy} className="w-fit rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-50">Create API key</button>
        </form>

        <div className="mt-6 divide-y divide-zinc-800">
          {apiKeys.length === 0 ? <p className="py-5 text-sm text-zinc-500">No API keys yet.</p> : null}
          {apiKeys.map((key) => (
            <div key={key.id} className="grid gap-3 py-5 lg:grid-cols-[1fr_auto]">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{key.name}</p>
                  <code className="rounded bg-zinc-900 px-2 py-1 text-xs text-zinc-400">{key.keyPrefix}…</code>
                  {key.revokedAt ? <span className="text-xs text-red-400">revoked</span> : null}
                </div>
                <p className="mt-2 text-xs text-zinc-500">{key.scopes.join(', ')}</p>
                <p className="mt-1 text-xs text-zinc-600">Last used: {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : 'never'} · Expires: {key.expiresAt ? new Date(key.expiresAt).toLocaleDateString() : 'never'}</p>
              </div>
              {!key.revokedAt ? (
                <div className="flex items-start gap-2">
                  <button
                    disabled={busy}
                    className="rounded-lg border border-zinc-700 px-3 py-2 text-sm"
                    type="button"
                    onClick={() => void run(async () => {
                      const result = await requestJson<{ secret: string }>(`/api/platform/api-keys/${key.id}/rotate`, { method: 'POST' });
                      setApiSecret(result.secret);
                      router.refresh();
                    })}
                  >Rotate</button>
                  <button
                    disabled={busy}
                    className="rounded-lg border border-red-900 px-3 py-2 text-sm text-red-300"
                    type="button"
                    onClick={() => void run(async () => {
                      if (!window.confirm(`Revoke ${key.name}? Existing clients will stop working immediately.`)) return;
                      await requestJson(`/api/platform/api-keys/${key.id}/revoke`, { method: 'POST' });
                      router.refresh();
                    })}
                  >Revoke</button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      {webhookSecret ? (
        <section className="rounded-2xl border border-emerald-800 bg-emerald-950/30 p-5">
          <p className="font-semibold text-emerald-200">Copy this webhook signing secret now. It will not be shown again.</p>
          <code className="mt-3 block overflow-x-auto rounded-lg bg-black/40 p-3 text-sm text-emerald-100">{webhookSecret}</code>
          <button className="mt-3 text-sm underline" type="button" onClick={() => setWebhookSecret(null)}>I saved it</button>
        </section>
      ) : null}

      <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
        <h2 className="text-2xl font-semibold">Outbound webhooks</h2>
        <p className="mt-2 text-sm text-zinc-400">Only public HTTPS destinations are allowed. Requests are signed and redirects are not followed.</p>
        <form
          className="mt-6 grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            void run(async () => {
              const data = new FormData(form);
              const result = await requestJson<{ signingSecret: string }>('/api/platform/webhooks', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  name: String(data.get('name') ?? ''),
                  url: String(data.get('url') ?? ''),
                  eventTypes: data.getAll('eventTypes').map(String),
                }),
              });
              setWebhookSecret(result.signingSecret);
              form.reset();
              router.refresh();
            });
          }}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <input className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2" name="name" maxLength={80} required placeholder="Production webhook" />
            <input className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2" name="url" type="url" required placeholder="https://example.com/webhooks/ai-saas" />
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <label className="flex items-center gap-2 rounded-lg border border-zinc-800 px-3 py-2 text-sm"><input type="checkbox" name="eventTypes" value="*" /> *</label>
            {OUTBOUND_WEBHOOK_EVENT_TYPES.map((type) => (
              <label key={type} className="flex items-center gap-2 rounded-lg border border-zinc-800 px-3 py-2 text-sm">
                <input type="checkbox" name="eventTypes" value={type} defaultChecked={type === 'webhook.test'} /> {type}
              </label>
            ))}
          </div>
          <button type="submit" disabled={busy} className="w-fit rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-50">Create webhook</button>
        </form>

        <div className="mt-6 divide-y divide-zinc-800">
          {endpoints.length === 0 ? <p className="py-5 text-sm text-zinc-500">No webhook endpoints yet.</p> : null}
          {endpoints.filter((endpoint) => endpoint.status !== 'deleted').map((endpoint) => (
            <div key={endpoint.id} className="grid gap-3 py-5 xl:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><p className="font-medium">{endpoint.name}</p><span className="text-xs text-zinc-500">{endpoint.status}</span></div>
                <p className="mt-1 break-all text-sm text-zinc-400">{endpoint.url}</p>
                <p className="mt-2 text-xs text-zinc-500">{endpoint.eventTypes.join(', ')}</p>
                <p className="mt-1 text-xs text-zinc-600">Last delivered: {endpoint.lastDeliveryAt ? new Date(endpoint.lastDeliveryAt).toLocaleString() : 'never'}</p>
              </div>
              <div className="flex flex-wrap items-start gap-2">
                <button disabled={busy || endpoint.status !== 'active'} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm disabled:opacity-40" type="button" onClick={() => void run(async () => { await requestJson(`/api/platform/webhooks/${endpoint.id}/test`, { method: 'POST' }); setNotice('Test delivery queued.'); router.refresh(); })}>Test</button>
                <button disabled={busy} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm" type="button" onClick={() => void run(async () => { const result = await requestJson<{ signingSecret: string }>(`/api/platform/webhooks/${endpoint.id}/rotate-secret`, { method: 'POST' }); setWebhookSecret(result.signingSecret); router.refresh(); })}>Rotate secret</button>
                <button disabled={busy} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm" type="button" onClick={() => void run(async () => { await requestJson(`/api/platform/webhooks/${endpoint.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: endpoint.status === 'active' ? 'disabled' : 'active' }) }); router.refresh(); })}>{endpoint.status === 'active' ? 'Disable' : 'Enable'}</button>
                <button disabled={busy} className="rounded-lg border border-red-900 px-3 py-2 text-sm text-red-300" type="button" onClick={() => void run(async () => { if (!window.confirm(`Delete ${endpoint.name}?`)) return; await requestJson(`/api/platform/webhooks/${endpoint.id}`, { method: 'DELETE' }); router.refresh(); })}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
        <h2 className="text-2xl font-semibold">Delivery log</h2>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="text-zinc-500"><tr><th className="pb-3">Created</th><th className="pb-3">Endpoint</th><th className="pb-3">Event</th><th className="pb-3">Status</th><th className="pb-3">Attempts</th><th className="pb-3">HTTP</th><th className="pb-3">Error</th></tr></thead>
            <tbody className="divide-y divide-zinc-800">
              {deliveries.map((delivery) => (
                <tr key={delivery.id}>
                  <td className="py-3 text-zinc-500">{new Date(delivery.createdAt).toLocaleString()}</td>
                  <td className="py-3">{delivery.endpointName}</td>
                  <td className="py-3"><p>{delivery.eventType}</p><code className="text-xs text-zinc-600">{delivery.eventId}</code></td>
                  <td className="py-3">{delivery.status}</td>
                  <td className="py-3">{delivery.attemptCount}</td>
                  <td className="py-3">{delivery.responseStatus ?? '—'}</td>
                  <td className="max-w-sm truncate py-3 text-zinc-500">{delivery.lastError ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {deliveries.length === 0 ? <p className="py-6 text-sm text-zinc-500">No deliveries yet.</p> : null}
        </div>
      </section>
    </div>
  );
}
