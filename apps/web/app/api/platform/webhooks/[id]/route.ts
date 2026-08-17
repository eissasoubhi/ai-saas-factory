import { softDeleteWebhookEndpoint, updateWebhookEndpointForOrganization } from '@factory/db';
import { resolvePublicWebhookTarget } from '@factory/platform-security';
import { correlationIdFromHeaders, emitTelemetry } from '@factory/telemetry';
import { recordAuditEvent } from '@/lib/audit';
import { requirePlatformManager } from '@/lib/organization-access';
import { WebhookEndpointUpdateSchema } from '@/lib/platform-input';

export const runtime = 'nodejs';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const correlationId = correlationIdFromHeaders(request.headers);
  const access = await requirePlatformManager(request.headers);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  const body = await request.json().catch(() => null);
  const parsed = WebhookEndpointUpdateSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: 'Invalid webhook endpoint update.' }, { status: 400 });
  if (parsed.data.url) {
    try {
      await resolvePublicWebhookTarget(parsed.data.url);
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : 'Webhook URL is not allowed.' },
        { status: 400 },
      );
    }
  }

  const { id } = await context.params;
  const updated = await updateWebhookEndpointForOrganization({
    organizationId: access.context.organization.id,
    endpointId: id,
    ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
    ...(parsed.data.url !== undefined ? { url: parsed.data.url } : {}),
    ...(parsed.data.eventTypes !== undefined ? { eventTypes: [...new Set(parsed.data.eventTypes)] } : {}),
    ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
  });
  if (!updated) return Response.json({ error: 'Webhook endpoint not found.' }, { status: 404 });

  await recordAuditEvent({
    organizationId: access.context.organization.id,
    actorUserId: access.context.session.user.id,
    action: 'webhook_endpoint.updated',
    entityType: 'webhook_endpoint',
    entityId: id,
    metadata: {
      changed: Object.keys(parsed.data).filter((key) => key !== 'url'),
      ...(parsed.data.eventTypes ? { eventTypes: parsed.data.eventTypes } : {}),
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
    },
    correlationId,
  });
  emitTelemetry({
    name: 'web.webhook_endpoint.updated',
    component: 'web',
    correlationId,
    organizationId: access.context.organization.id,
    userId: access.context.session.user.id,
    attributes: { endpointId: id, status: updated.status },
  });
  return Response.json({
    data: {
      id: updated.id,
      name: updated.name,
      url: updated.url,
      status: updated.status,
      eventTypes: updated.eventTypes,
      disabledAt: updated.disabledAt,
      updatedAt: updated.updatedAt,
    },
  });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const correlationId = correlationIdFromHeaders(request.headers);
  const access = await requirePlatformManager(request.headers);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  const { id } = await context.params;
  const deleted = await softDeleteWebhookEndpoint(access.context.organization.id, id);
  if (!deleted) return Response.json({ error: 'Webhook endpoint not found.' }, { status: 404 });

  await recordAuditEvent({
    organizationId: access.context.organization.id,
    actorUserId: access.context.session.user.id,
    action: 'webhook_endpoint.deleted',
    entityType: 'webhook_endpoint',
    entityId: id,
    correlationId,
  });
  emitTelemetry({
    name: 'web.webhook_endpoint.deleted',
    component: 'web',
    correlationId,
    organizationId: access.context.organization.id,
    userId: access.context.session.user.id,
    attributes: { endpointId: id },
  });
  return new Response(null, { status: 204 });
}
