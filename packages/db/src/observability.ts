import { and, desc, eq, gte, lt, or, sql, sum } from 'drizzle-orm';
import { database } from './index';
import { auditLog, usageEvent, user } from './schema';

export type AuditCursor = {
  createdAt: Date;
  id: string;
};

export function encodeAuditCursor(cursor: AuditCursor) {
  return Buffer.from(`${cursor.createdAt.toISOString()}\n${cursor.id}`, 'utf8').toString('base64url');
}

export function decodeAuditCursor(value: string | null | undefined): AuditCursor | null {
  if (!value) return null;
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8');
    const separator = decoded.indexOf('\n');
    if (separator <= 0) return null;
    const createdAt = new Date(decoded.slice(0, separator));
    const id = decoded.slice(separator + 1);
    if (!id || Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

function boundedFilter(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized || normalized.length > 100) return null;
  return normalized;
}

export async function listAuditLogsForOrganization(input: {
  organizationId: string;
  limit?: number;
  cursor?: string | null;
  action?: string | null;
  entityType?: string | null;
}) {
  const db = database();
  const limit = Math.min(Math.max(Math.floor(input.limit ?? 50), 1), 100);
  const cursor = decodeAuditCursor(input.cursor);
  const action = boundedFilter(input.action);
  const entityType = boundedFilter(input.entityType);
  const conditions = [eq(auditLog.organizationId, input.organizationId)];
  if (action) conditions.push(eq(auditLog.action, action));
  if (entityType) conditions.push(eq(auditLog.entityType, entityType));
  if (cursor) {
    conditions.push(
      or(
        lt(auditLog.createdAt, cursor.createdAt),
        and(eq(auditLog.createdAt, cursor.createdAt), lt(auditLog.id, cursor.id)),
      )!,
    );
  }

  const rows = await db
    .select({
      id: auditLog.id,
      actorUserId: auditLog.actorUserId,
      actorEmail: user.email,
      action: auditLog.action,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      metadata: auditLog.metadata,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .leftJoin(user, eq(user.id, auditLog.actorUserId))
    .where(and(...conditions))
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);
  return {
    items,
    nextCursor: hasMore && last ? encodeAuditCursor({ createdAt: last.createdAt, id: last.id }) : null,
  };
}

export async function getOrganizationUsageOverview(organizationId: string, now = new Date()) {
  const db = database();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const day = sql<string>`to_char(date_trunc('day', ${usageEvent.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`;
  const modelId = sql<string>`coalesce(${usageEvent.metadata}->>'modelId', 'unattributed')`;

  const [metricRows, dailyRows, modelRows] = await Promise.all([
    db
      .select({ metric: usageEvent.metric, value: sum(usageEvent.quantity) })
      .from(usageEvent)
      .where(and(eq(usageEvent.organizationId, organizationId), gte(usageEvent.createdAt, monthStart)))
      .groupBy(usageEvent.metric)
      .orderBy(usageEvent.metric),
    db
      .select({ day, metric: usageEvent.metric, value: sum(usageEvent.quantity) })
      .from(usageEvent)
      .where(and(eq(usageEvent.organizationId, organizationId), gte(usageEvent.createdAt, monthStart)))
      .groupBy(day, usageEvent.metric)
      .orderBy(day, usageEvent.metric),
    db
      .select({ modelId, metric: usageEvent.metric, value: sum(usageEvent.quantity) })
      .from(usageEvent)
      .where(and(eq(usageEvent.organizationId, organizationId), gte(usageEvent.createdAt, monthStart)))
      .groupBy(modelId, usageEvent.metric)
      .orderBy(modelId, usageEvent.metric),
  ]);

  const metrics = Object.fromEntries(metricRows.map((row) => [row.metric, Number(row.value ?? 0)]));
  const daily = dailyRows.map((row) => ({ day: row.day, metric: row.metric, value: Number(row.value ?? 0) }));
  const byModel = modelRows.map((row) => ({
    modelId: row.modelId,
    metric: row.metric,
    value: Number(row.value ?? 0),
  }));

  return {
    monthStart,
    metrics,
    daily,
    byModel,
    totalCostMicros: metrics['ai.cost_micros'] ?? 0,
    requests: metrics['ai.requests'] ?? 0,
    inputTokens: metrics['ai.input_tokens'] ?? 0,
    outputTokens: metrics['ai.output_tokens'] ?? 0,
    embeddingTokens: metrics['ai.embedding_tokens'] ?? 0,
  };
}
