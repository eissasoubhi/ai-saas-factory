import { rotateApiKeyRecord } from '@factory/db';
import { generateApiKey, normalizeApiKeyScopes } from '@factory/platform-security';
import { correlationIdFromHeaders, emitTelemetry } from '@factory/telemetry';
import { recordAuditEvent } from '@/lib/audit';
import { requirePlatformManager } from '@/lib/organization-access';
import { ApiKeyCreateSchema, expirationFromDays } from '@/lib/platform-input';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const correlationId = correlationIdFromHeaders(request.headers);
  const access = await requirePlatformManager(request.headers);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  const body = await request.json().catch(() => null);
  const parsed = ApiKeyCreateSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: 'Invalid replacement API key configuration.' }, { status: 400 });
  const { id } = await context.params;
  const generated = generateApiKey();
  const replacement = await rotateApiKeyRecord({
    organizationId: access.context.organization.id,
    oldKeyId: id,
    replacement: {
      id: generated.id,
      createdByUserId: access.context.session.user.id,
      name: parsed.data.name,
      keyPrefix: generated.prefix,
      keyHash: generated.hash,
      scopes: normalizeApiKeyScopes(parsed.data.scopes),
      expiresAt: expirationFromDays(parsed.data.expiresInDays),
    },
  });
  if (!replacement) return Response.json({ error: 'API key not found or already revoked.' }, { status: 404 });

  await recordAuditEvent({
    organizationId: access.context.organization.id,
    actorUserId: access.context.session.user.id,
    action: 'api_key.rotated',
    entityType: 'api_key',
    entityId: replacement.id,
    metadata: { previousKeyId: id, keyPrefix: replacement.keyPrefix, scopes: replacement.scopes },
    correlationId,
  });
  emitTelemetry({
    name: 'web.api_key.rotated',
    component: 'web',
    correlationId,
    organizationId: access.context.organization.id,
    userId: access.context.session.user.id,
    attributes: { previousKeyId: id, keyId: replacement.id, keyPrefix: replacement.keyPrefix },
  });
  return Response.json({
    data: {
      id: replacement.id,
      name: replacement.name,
      keyPrefix: replacement.keyPrefix,
      scopes: replacement.scopes,
      expiresAt: replacement.expiresAt,
      createdAt: replacement.createdAt,
    },
    secret: generated.token,
  });
}
