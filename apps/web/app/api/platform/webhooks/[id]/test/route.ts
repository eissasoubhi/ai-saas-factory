import { randomUUID } from 'node:crypto';
import { createWebhookDeliveryForEndpoint } from '@factory/db';
import { enqueueOutboundWebhookDelivery } from '@factory/jobs';
import { correlationIdFromHeaders, emitTelemetry } from '@factory/telemetry';
import { recordAuditEvent } from '@/lib/audit';
import { requirePlatformManager } from '@/lib/organization-access';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const correlationId = correlationIdFromHeaders(request.headers);
  const access = await requirePlatformManager(request.headers);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  const { id } = await context.params;
  const eventId = `evt_${randomUUID()}`;
  const payload = {
    id: eventId,
    type: 'webhook.test',
    createdAt: new Date().toISOString(),
    data: { source: 'settings' },
  };
  const delivery = await createWebhookDeliveryForEndpoint({
    organizationId: access.context.organization.id,
    endpointId: id,
    eventId,
    eventType: 'webhook.test',
    payload,
  });
  if (!delivery) return Response.json({ error: 'Active webhook endpoint not found.' }, { status: 404 });

  await enqueueOutboundWebhookDelivery({ deliveryId: delivery.id });
  await recordAuditEvent({
    organizationId: access.context.organization.id,
    actorUserId: access.context.session.user.id,
    action: 'webhook_endpoint.test_enqueued',
    entityType: 'webhook_endpoint',
    entityId: id,
    metadata: { deliveryId: delivery.id, eventId },
    correlationId,
  });
  emitTelemetry({
    name: 'web.webhook_endpoint.test_enqueued',
    component: 'web',
    correlationId,
    organizationId: access.context.organization.id,
    userId: access.context.session.user.id,
    attributes: { endpointId: id, deliveryId: delivery.id, eventId },
  });
  return Response.json({ data: { deliveryId: delivery.id, eventId } }, { status: 202 });
}
