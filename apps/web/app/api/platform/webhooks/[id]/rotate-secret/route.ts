import { getWebhookEndpointForOrganization, rotateWebhookEndpointSecret } from '@factory/db';
import {
  encryptSecret,
  generateWebhookSecret,
  platformEncryptionKey,
} from '@factory/platform-security';
import { correlationIdFromHeaders, emitTelemetry } from '@factory/telemetry';
import { recordAuditEvent } from '@/lib/audit';
import { requirePlatformManager } from '@/lib/organization-access';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const correlationId = correlationIdFromHeaders(request.headers);
  const access = await requirePlatformManager(request.headers);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  const { id } = await context.params;
  const endpoint = await getWebhookEndpointForOrganization(access.context.organization.id, id);
  if (!endpoint || endpoint.deletedAt) return Response.json({ error: 'Webhook endpoint not found.' }, { status: 404 });

  const secret = generateWebhookSecret();
  const encrypted = encryptSecret(secret, platformEncryptionKey());
  const secretVersion = endpoint.secretVersion + 1;
  const rotated = await rotateWebhookEndpointSecret({
    organizationId: access.context.organization.id,
    endpointId: id,
    secretCiphertext: encrypted.ciphertext,
    secretIv: encrypted.iv,
    secretTag: encrypted.tag,
    secretVersion,
  });
  if (!rotated) return Response.json({ error: 'Webhook endpoint not found.' }, { status: 404 });

  await recordAuditEvent({
    organizationId: access.context.organization.id,
    actorUserId: access.context.session.user.id,
    action: 'webhook_endpoint.secret_rotated',
    entityType: 'webhook_endpoint',
    entityId: id,
    metadata: { secretVersion },
    correlationId,
  });
  emitTelemetry({
    name: 'web.webhook_endpoint.secret_rotated',
    component: 'web',
    correlationId,
    organizationId: access.context.organization.id,
    userId: access.context.session.user.id,
    attributes: { endpointId: id, secretVersion },
  });
  return Response.json({ data: { id, secretVersion }, signingSecret: secret });
}
