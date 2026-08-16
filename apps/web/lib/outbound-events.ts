import { randomUUID } from 'node:crypto';
import { createWebhookDeliveriesForEvent } from '@factory/db';
import { enqueueOutboundWebhookDelivery } from '@factory/jobs';
import { emitTelemetry, sanitizeTelemetryAttributes } from '@factory/telemetry';

export const OUTBOUND_WEBHOOK_EVENT_TYPES = [
  'webhook.test',
  'ai.generation.completed',
  'file.ready',
  'file.failed',
  'billing.subscription.updated',
] as const;

export type OutboundWebhookEventType = (typeof OUTBOUND_WEBHOOK_EVENT_TYPES)[number];

export async function publishOutboundWebhookEvent(input: {
  organizationId: string;
  type: OutboundWebhookEventType;
  data?: Record<string, unknown>;
  eventId?: string;
  occurredAt?: Date;
  correlationId?: string | null;
}) {
  const eventId = input.eventId ?? `evt_${randomUUID()}`;
  const occurredAt = input.occurredAt ?? new Date();
  const safeData = sanitizeTelemetryAttributes(input.data) ?? {};
  const payload = {
    id: eventId,
    type: input.type,
    createdAt: occurredAt.toISOString(),
    data: safeData,
  };
  const deliveries = await createWebhookDeliveriesForEvent({
    organizationId: input.organizationId,
    eventId,
    eventType: input.type,
    payload,
  });
  const enqueued = await Promise.all(
    deliveries.map(async (delivery) => {
      const result = await enqueueOutboundWebhookDelivery({ deliveryId: delivery.id });
      return { deliveryId: delivery.id, deduplicated: result.deduplicated };
    }),
  );
  emitTelemetry({
    name: 'web.outbound_webhook.published',
    component: 'web',
    ...(input.correlationId !== undefined ? { correlationId: input.correlationId } : {}),
    organizationId: input.organizationId,
    attributes: { eventId, eventType: input.type, deliveries: deliveries.length },
  });
  return { eventId, payload, deliveries: enqueued };
}
