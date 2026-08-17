import {
  listApiKeysForOrganization,
  listWebhookDeliveriesForOrganization,
  listWebhookEndpointsForOrganization,
} from '@factory/db';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getActiveOrganizationContext } from '@/lib/organization-access';
import { PlatformSettingsClient } from './platform-settings-client';

export default async function PlatformSettingsPage() {
  const context = await getActiveOrganizationContext(new Headers(await headers()));
  if (!context) redirect('/dashboard');
  if (context.role !== 'owner' && context.role !== 'admin') redirect('/dashboard');

  const organizationId = context.organization.id;
  const [apiKeys, endpoints, deliveryPage] = await Promise.all([
    listApiKeysForOrganization(organizationId),
    listWebhookEndpointsForOrganization(organizationId),
    listWebhookDeliveriesForOrganization({ organizationId, limit: 100 }),
  ]);

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">{context.organization.name}</p>
          <h1 className="mt-2 text-4xl font-bold">Platform API & webhooks</h1>
          <p className="mt-3 max-w-3xl text-zinc-400">Issue scoped API keys and deliver signed, retryable customer webhooks without exposing tenant or infrastructure secrets.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="rounded-lg border border-zinc-700 px-4 py-2 text-sm" href="/settings/audit">Audit</Link>
          <Link className="rounded-lg border border-zinc-700 px-4 py-2 text-sm" href="/settings/usage">AI usage</Link>
          <Link className="rounded-lg border border-zinc-700 px-4 py-2 text-sm" href="/dashboard">Dashboard</Link>
        </div>
      </div>

      <div className="mt-10">
        <PlatformSettingsClient
          apiKeys={apiKeys.map((key) => ({
            id: key.id,
            name: key.name,
            keyPrefix: key.keyPrefix,
            scopes: key.scopes,
            expiresAt: key.expiresAt?.toISOString() ?? null,
            revokedAt: key.revokedAt?.toISOString() ?? null,
            lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
            createdAt: key.createdAt.toISOString(),
          }))}
          endpoints={endpoints.map((endpoint) => ({
            id: endpoint.id,
            name: endpoint.name,
            url: endpoint.url,
            status: endpoint.status,
            eventTypes: endpoint.eventTypes,
            lastDeliveryAt: endpoint.lastDeliveryAt?.toISOString() ?? null,
            createdAt: endpoint.createdAt.toISOString(),
          }))}
          deliveries={deliveryPage.items.map((delivery) => ({
            id: delivery.id,
            endpointId: delivery.endpointId,
            endpointName: delivery.endpointName,
            eventId: delivery.eventId,
            eventType: delivery.eventType,
            status: delivery.status,
            attemptCount: delivery.attemptCount,
            responseStatus: delivery.responseStatus,
            lastError: delivery.lastError,
            lastAttemptAt: delivery.lastAttemptAt?.toISOString() ?? null,
            deliveredAt: delivery.deliveredAt?.toISOString() ?? null,
            createdAt: delivery.createdAt.toISOString(),
          }))}
        />
      </div>
    </main>
  );
}
