import { revokeApiKeyForOrganization } from '@factory/db';
import { correlationIdFromHeaders, emitTelemetry } from '@factory/telemetry';
import { recordAuditEvent } from '@/lib/audit';
import { requirePlatformManager } from '@/lib/organization-access';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const correlationId = correlationIdFromHeaders(request.headers);
  const access = await requirePlatformManager(request.headers);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  const { id } = await context.params;
  const revoked = await revokeApiKeyForOrganization(access.context.organization.id, id);
  if (!revoked) return Response.json({ error: 'API key not found or already revoked.' }, { status: 404 });

  await recordAuditEvent({
    organizationId: access.context.organization.id,
    actorUserId: access.context.session.user.id,
    action: 'api_key.revoked',
    entityType: 'api_key',
    entityId: id,
    correlationId,
  });
  emitTelemetry({
    name: 'web.api_key.revoked',
    component: 'web',
    correlationId,
    organizationId: access.context.organization.id,
    userId: access.context.session.user.id,
    attributes: { keyId: id },
  });
  return new Response(null, { status: 204 });
}
