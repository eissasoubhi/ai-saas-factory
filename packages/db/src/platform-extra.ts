import { randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { assertOrganizationScope } from './ai-policy';
import { database } from './index';
import { apiKey, outboundWebhookDelivery, outboundWebhookEndpoint } from './platform-schema';

export async function getApiKeyForOrganization(organizationId: string, keyId: string) {
  const [row] = await database()
    .select()
    .from(apiKey)
    .where(and(eq(apiKey.id, keyId), eq(apiKey.organizationId, organizationId)))
    .limit(1);
  if (row) assertOrganizationScope(organizationId, [row]);
  return row ?? null;
}

export async function createWebhookDeliveryForEndpoint(input: {
  organizationId: string;
  endpointId: string;
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
}) {
  const db = database();
  const [endpoint] = await db
    .select({
      id: outboundWebhookEndpoint.id,
      organizationId: outboundWebhookEndpoint.organizationId,
      status: outboundWebhookEndpoint.status,
    })
    .from(outboundWebhookEndpoint)
    .where(
      and(
        eq(outboundWebhookEndpoint.id, input.endpointId),
        eq(outboundWebhookEndpoint.organizationId, input.organizationId),
        eq(outboundWebhookEndpoint.status, 'active'),
        isNull(outboundWebhookEndpoint.deletedAt),
      ),
    )
    .limit(1);
  if (!endpoint) return null;
  assertOrganizationScope(input.organizationId, [endpoint]);

  const [delivery] = await db
    .insert(outboundWebhookDelivery)
    .values({
      id: randomUUID(),
      organizationId: input.organizationId,
      endpointId: endpoint.id,
      eventId: input.eventId,
      eventType: input.eventType,
      payload: input.payload,
    })
    .onConflictDoNothing()
    .returning({
      id: outboundWebhookDelivery.id,
      organizationId: outboundWebhookDelivery.organizationId,
      endpointId: outboundWebhookDelivery.endpointId,
    });
  if (delivery) assertOrganizationScope(input.organizationId, [delivery]);
  return delivery ?? null;
}
