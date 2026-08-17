import { createApiKeyRecord, listApiKeysForOrganization } from '@factory/db';
import { generateApiKey, normalizeApiKeyScopes } from '@factory/platform-security';
import { correlationIdFromHeaders, emitTelemetry } from '@factory/telemetry';
import { recordAuditEvent } from '@/lib/audit';
import { requirePlatformManager } from '@/lib/organization-access';
import { ApiKeyCreateSchema, expirationFromDays } from '@/lib/platform-input';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const access = await requirePlatformManager(request.headers);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  const rows = await listApiKeysForOrganization(access.context.organization.id);
  return Response.json({ data: rows });
}

export async function POST(request: Request) {
  const correlationId = correlationIdFromHeaders(request.headers);
  const access = await requirePlatformManager(request.headers);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  const body = await request.json().catch(() => null);
  const parsed = ApiKeyCreateSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: 'Invalid API key configuration.' }, { status: 400 });

  const generated = generateApiKey();
  const scopes = normalizeApiKeyScopes(parsed.data.scopes);
  const expiresAt = expirationFromDays(parsed.data.expiresInDays);
  const created = await createApiKeyRecord({
    id: generated.id,
    organizationId: access.context.organization.id,
    createdByUserId: access.context.session.user.id,
    name: parsed.data.name,
    keyPrefix: generated.prefix,
    keyHash: generated.hash,
    scopes,
    expiresAt,
  });
  if (!created) return Response.json({ error: 'Unable to create API key.' }, { status: 500 });

  await recordAuditEvent({
    organizationId: access.context.organization.id,
    actorUserId: access.context.session.user.id,
    action: 'api_key.created',
    entityType: 'api_key',
    entityId: created.id,
    metadata: { name: created.name, keyPrefix: created.keyPrefix, scopes: created.scopes, expiresAt: created.expiresAt },
    correlationId,
  });
  emitTelemetry({
    name: 'web.api_key.created',
    component: 'web',
    correlationId,
    organizationId: access.context.organization.id,
    userId: access.context.session.user.id,
    attributes: { keyId: created.id, keyPrefix: created.keyPrefix, scopes: created.scopes.length },
  });

  return Response.json(
    {
      data: {
        id: created.id,
        name: created.name,
        keyPrefix: created.keyPrefix,
        scopes: created.scopes,
        expiresAt: created.expiresAt,
        createdAt: created.createdAt,
      },
      secret: generated.token,
    },
    { status: 201 },
  );
}
