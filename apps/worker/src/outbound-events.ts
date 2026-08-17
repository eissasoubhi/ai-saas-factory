import { createWebhookDeliveriesForEvent } from '@factory/db';
import { enqueueOutboundWebhookDelivery } from '@factory/jobs';
import { emitTelemetry, sanitizeTelemetryAttributes } from '@factory/telemetry';

export async function publishWorkerOutboundEvent(input: {
  organizationId: string;
  eventId: string;
  eventType: 'file.ready' | 'file.failed';
  data: Record<string, unknown>;
  correlationId: string;
}) {
  const payload = {
    id: input.eventId,
    type: input.eventType,
    createdAt: new Date().toISOString(),
    data: sanitizeTelemetryAttributes(input.data) ?? {},
  };
  const deliveries = await createWebhookDeliveriesForEvent({
    organizationId: input.organizationId,
    eventId: input.eventId,
    eventType: input.eventType,
    payload,
  });
  await Promise.all(
    deliveries.map((delivery) => enqueueOutboundWebhookDelivery({ deliveryId: delivery.id })),
  );
  emitTelemetry({
    name: 'worker.outbound_webhook.published',
    component: 'worker',
    correlationId: input.correlationId,
    organizationId: input.organizationId,
    attributes: { eventId: input.eventId, eventType: input.eventType, deliveries: deliveries.length },
  });
  return deliveries.length;
}
