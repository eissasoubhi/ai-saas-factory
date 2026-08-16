import {
  beginWebhookDeliveryAttempt,
  getWebhookDeliveryForWorker,
  markWebhookDeliveryCancelled,
  markWebhookDeliveryDead,
  markWebhookDeliveryFailed,
  markWebhookDeliverySucceeded,
} from '@factory/db';
import { OutboundWebhookDeliveryJobSchema } from '@factory/jobs';
import { decryptSecret, platformEncryptionKey, postSignedWebhook } from '@factory/platform-security';
import { emitTelemetry } from '@factory/telemetry';

function encryptedSecretFromDelivery(delivery: Awaited<ReturnType<typeof getWebhookDeliveryForWorker>>) {
  if (!delivery) throw new Error('Webhook delivery does not exist');
  if (delivery.secretVersion !== 1) throw new Error('Unsupported webhook secret version');
  return {
    version: 1 as const,
    ciphertext: delivery.secretCiphertext,
    iv: delivery.secretIv,
    tag: delivery.secretTag,
  };
}

export async function processOutboundWebhookDelivery(data: unknown, correlationId: string) {
  const payload = OutboundWebhookDeliveryJobSchema.parse(data);
  const startedAt = Date.now();
  const delivery = await getWebhookDeliveryForWorker(payload.deliveryId);
  if (!delivery) {
    emitTelemetry({
      name: 'worker.webhook_delivery.skipped',
      component: 'worker',
      correlationId,
      attributes: { deliveryId: payload.deliveryId, reason: 'missing' },
    });
    return { deliveryId: payload.deliveryId, status: 'missing' } as const;
  }

  if (delivery.deliveryStatus === 'succeeded' || delivery.deliveryStatus === 'dead' || delivery.deliveryStatus === 'cancelled') {
    return { deliveryId: delivery.id, status: 'already_terminal' } as const;
  }

  if (delivery.endpointStatus !== 'active' || delivery.endpointDeletedAt) {
    await markWebhookDeliveryCancelled(delivery.id);
    emitTelemetry({
      name: 'worker.webhook_delivery.cancelled',
      component: 'worker',
      correlationId,
      organizationId: delivery.organizationId,
      attributes: { deliveryId: delivery.id, endpointId: delivery.endpointId, reason: 'endpoint_inactive' },
    });
    return { deliveryId: delivery.id, status: 'cancelled' } as const;
  }

  const attempt = await beginWebhookDeliveryAttempt(delivery.id);
  const attemptCount = attempt?.attemptCount ?? delivery.attemptCount + 1;
  let responseStatus: number | null = null;
  let responseBodyPreview: string | null = null;
  try {
    const secret = decryptSecret(encryptedSecretFromDelivery(delivery), platformEncryptionKey());
    const body = JSON.stringify(delivery.payload);
    const response = await postSignedWebhook({
      url: delivery.url,
      eventId: delivery.eventId,
      eventType: delivery.eventType,
      body,
      secret,
    });
    responseStatus = response.status;
    responseBodyPreview = response.bodyPreview;
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Webhook endpoint returned HTTP ${response.status}`);
    }

    await markWebhookDeliverySucceeded({
      deliveryId: delivery.id,
      endpointId: delivery.endpointId,
      responseStatus: response.status,
      responseBodyPreview: response.bodyPreview,
    });
    emitTelemetry({
      name: 'worker.webhook_delivery.completed',
      component: 'worker',
      correlationId,
      durationMs: Date.now() - startedAt,
      organizationId: delivery.organizationId,
      attributes: {
        deliveryId: delivery.id,
        endpointId: delivery.endpointId,
        eventType: delivery.eventType,
        attemptCount,
        responseStatus: response.status,
      },
    });
    return { deliveryId: delivery.id, status: 'succeeded' } as const;
  } catch (error) {
    await markWebhookDeliveryFailed({
      deliveryId: delivery.id,
      error,
      responseStatus,
      responseBodyPreview,
    });
    emitTelemetry({
      name: 'worker.webhook_delivery.failed',
      level: 'error',
      component: 'worker',
      correlationId,
      durationMs: Date.now() - startedAt,
      organizationId: delivery.organizationId,
      attributes: {
        deliveryId: delivery.id,
        endpointId: delivery.endpointId,
        eventType: delivery.eventType,
        attemptCount,
        ...(responseStatus !== null ? { responseStatus } : {}),
      },
      error,
    });
    throw error;
  }
}

export async function processOutboundWebhookDeadLetter(data: unknown, correlationId: string) {
  const payload = OutboundWebhookDeliveryJobSchema.parse(data);
  const delivery = await getWebhookDeliveryForWorker(payload.deliveryId);
  if (!delivery) return;
  await markWebhookDeliveryDead(delivery.id);
  emitTelemetry({
    name: 'worker.webhook_delivery.dead',
    level: 'error',
    component: 'worker',
    correlationId,
    organizationId: delivery.organizationId,
    attributes: {
      deliveryId: delivery.id,
      endpointId: delivery.endpointId,
      eventType: delivery.eventType,
      attemptCount: delivery.attemptCount,
    },
  });
}
