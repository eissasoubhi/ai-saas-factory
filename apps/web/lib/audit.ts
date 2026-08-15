import { writeAuditLog } from '@factory/db';
import { emitTelemetry, sanitizeTelemetryAttributes } from '@factory/telemetry';

export async function recordAuditEvent(input: {
  organizationId: string;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  correlationId?: string | null;
}) {
  const metadata = sanitizeTelemetryAttributes(input.metadata);
  try {
    await writeAuditLog({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      ...(metadata ? { metadata } : {}),
    });
    return true;
  } catch (error) {
    emitTelemetry({
      name: 'web.audit_write.failed',
      level: 'error',
      component: 'web',
      correlationId: input.correlationId,
      organizationId: input.organizationId,
      userId: input.actorUserId,
      attributes: {
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
      },
      error,
    });
    return false;
  }
}
