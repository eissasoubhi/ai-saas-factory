import { createWebhookEndpointRecord, listWebhookEndpointsForOrganization } from '@factory/db';
import {
  encryptSecret,
  generateWebhookSecret,
  platformEncryptionKey,
  resolvePublicWebhookTarget,
} from '@factory/platform-security';
import { correlationIdFromHeaders, emitTelemetry } from '@factory/telemetry';
import { recordAuditEvent } from '@/lib/audit';
import { requirePlatformManager } from '@/lib/organization-access';
import { WebhookEndpointCreateSchema } from '@/lib/platform-input';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const access = await requirePlatformManager(request.headers);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  const rows = await listWebhookEndpointsForOrganization(access.context.organization.id);
  return Response.json({ data: rows });
}

export async function POST(request: Request) {
  const correlationId = correlationIdFromHeaders(request.headers);
  const access = await requirePlatformManager(request.headers);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  const body = await request.json().catch(() => null);
  const parsed = WebhookEndpointCreateSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: 'Invalid webhook endpoint configuration.' }, { status: 400 });

  try {
    await resolvePublicWebhookTarget(parsed.data.url);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Webhook URL is not allowed.' },
      { status: 400 },
    );
  }

  const secret = generateWebhookSecret();
  const encrypted = encryptSecret(secret, platformEncryptionKey());
  const eventTypes = [...new Set(parsed.data.eventTypes)];
  const created = await createWebhookEndpointRecord({
    organizationId: access.context.organization.id,
    createdByUserId: access.context.session.user.id,
    name: parsed.data.name,
    url: parsed.data.url,
    eventTypes,
    secretCiphertext: encrypted.ciphertext,
    secretIv: encrypted.iv,
    secretTag: encrypted.tag,
    secretVersion: encrypted.version,
  });
  if (!created) return Response.json({ error: 'Unable to create webhook endpoint.' }, { status: 500 });

  await recordAuditEvent({
    organizationId: access.context.organization.id,
    actorUserId: access.context.session.user.id,
    action: 'webhook_endpoint.created',
    entityType: 'webhook_endpoint',
    entityId: created.id,
    metadata: { name: created.name, eventTypes: created.eventTypes },
    correlationId,
  });
  emitTelemetry({
    name: 'web.webhook_endpoint.created',
    component: 'web',
    correlationId,
    organizationId: access.context.organization.id,
    userId: access.context.session.user.id,
    attributes: { endpointId: created.id, eventTypes: created.eventTypes },
  });

  return Response.json(
    {
      data: {
        id: created.id,
        name: created.name,
        url: created.url,
        status: created.status,
        eventTypes: created.eventTypes,
        createdAt: created.createdAt,
      },
      signingSecret: secret,
    },
    { status: 201 },
  );
}
