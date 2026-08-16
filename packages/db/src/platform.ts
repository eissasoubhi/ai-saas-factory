import { randomUUID } from 'node:crypto';
import { and, desc, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';
import { assertOrganizationScope } from './ai-policy';
import { database } from './index';
import { apiKey, outboundWebhookDelivery, outboundWebhookEndpoint } from './platform-schema';

export type PlatformCursor = {
  createdAt: Date;
  id: string;
};

export function encodePlatformCursor(cursor: PlatformCursor) {
  return Buffer.from(`${cursor.createdAt.toISOString()}\n${cursor.id}`, 'utf8').toString('base64url');
}

export function decodePlatformCursor(value: string | null | undefined): PlatformCursor | null {
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

export function normalizePlatformListLimit(value: number | undefined) {
  return Math.min(Math.max(Math.floor(value ?? 50), 1), 100);
}

export function endpointAcceptsEvent(eventTypes: readonly string[], eventType: string) {
  return eventTypes.includes('*') || eventTypes.includes(eventType);
}

export async function createApiKeyRecord(input: {
  id: string;
  organizationId: string;
  createdByUserId: string | null;
  name: string;
  keyPrefix: string;
  keyHash: string;
  scopes: string[];
  expiresAt?: Date | null;
}) {
  const [created] = await database()
    .insert(apiKey)
    .values({
      id: input.id,
      organizationId: input.organizationId,
      createdByUserId: input.createdByUserId,
      name: input.name,
      keyPrefix: input.keyPrefix,
      keyHash: input.keyHash,
      scopes: input.scopes,
      expiresAt: input.expiresAt ?? null,
    })
    .returning();
  return created ?? null;
}

export async function listApiKeysForOrganization(organizationId: string) {
  const rows = await database()
    .select({
      id: apiKey.id,
      organizationId: apiKey.organizationId,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      scopes: apiKey.scopes,
      expiresAt: apiKey.expiresAt,
      revokedAt: apiKey.revokedAt,
      lastUsedAt: apiKey.lastUsedAt,
      createdAt: apiKey.createdAt,
    })
    .from(apiKey)
    .where(eq(apiKey.organizationId, organizationId))
    .orderBy(desc(apiKey.createdAt));
  assertOrganizationScope(organizationId, rows);
  return rows;
}

export async function getApiKeyForAuthentication(id: string, now = new Date()) {
  const [row] = await database()
    .select()
    .from(apiKey)
    .where(
      and(
        eq(apiKey.id, id),
        isNull(apiKey.revokedAt),
        or(isNull(apiKey.expiresAt), gt(apiKey.expiresAt, now)),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function touchApiKeyLastUsed(id: string, usedAt = new Date()) {
  await database().update(apiKey).set({ lastUsedAt: usedAt, updatedAt: usedAt }).where(eq(apiKey.id, id));
}

export async function revokeApiKeyForOrganization(organizationId: string, id: string, revokedAt = new Date()) {
  const [row] = await database()
    .update(apiKey)
    .set({ revokedAt, updatedAt: revokedAt })
    .where(and(eq(apiKey.id, id), eq(apiKey.organizationId, organizationId), isNull(apiKey.revokedAt)))
    .returning({ id: apiKey.id, organizationId: apiKey.organizationId });
  if (row) assertOrganizationScope(organizationId, [row]);
  return row ?? null;
}

export async function rotateApiKeyRecord(input: {
  organizationId: string;
  oldKeyId: string;
  replacement: {
    id: string;
    createdByUserId: string | null;
    name: string;
    keyPrefix: string;
    keyHash: string;
    scopes: string[];
    expiresAt?: Date | null;
  };
  now?: Date;
}) {
  const db = database();
  const now = input.now ?? new Date();
  return await db.transaction(async (tx) => {
    const [oldKey] = await tx
      .update(apiKey)
      .set({ revokedAt: now, updatedAt: now })
      .where(
        and(
          eq(apiKey.id, input.oldKeyId),
          eq(apiKey.organizationId, input.organizationId),
          isNull(apiKey.revokedAt),
        ),
      )
      .returning({ id: apiKey.id, organizationId: apiKey.organizationId });
    if (!oldKey) return null;

    const [replacement] = await tx
      .insert(apiKey)
      .values({
        id: input.replacement.id,
        organizationId: input.organizationId,
        createdByUserId: input.replacement.createdByUserId,
        name: input.replacement.name,
        keyPrefix: input.replacement.keyPrefix,
        keyHash: input.replacement.keyHash,
        scopes: input.replacement.scopes,
        expiresAt: input.replacement.expiresAt ?? null,
      })
      .returning();
    return replacement ?? null;
  });
}

export async function createWebhookEndpointRecord(input: {
  organizationId: string;
  createdByUserId: string | null;
  name: string;
  url: string;
  eventTypes: string[];
  secretCiphertext: string;
  secretIv: string;
  secretTag: string;
  secretVersion: number;
}) {
  const id = randomUUID();
  const [created] = await database()
    .insert(outboundWebhookEndpoint)
    .values({ id, ...input })
    .returning();
  return created ?? null;
}

export async function listWebhookEndpointsForOrganization(organizationId: string) {
  const rows = await database()
    .select({
      id: outboundWebhookEndpoint.id,
      organizationId: outboundWebhookEndpoint.organizationId,
      name: outboundWebhookEndpoint.name,
      url: outboundWebhookEndpoint.url,
      status: outboundWebhookEndpoint.status,
      eventTypes: outboundWebhookEndpoint.eventTypes,
      disabledAt: outboundWebhookEndpoint.disabledAt,
      deletedAt: outboundWebhookEndpoint.deletedAt,
      lastDeliveryAt: outboundWebhookEndpoint.lastDeliveryAt,
      createdAt: outboundWebhookEndpoint.createdAt,
      updatedAt: outboundWebhookEndpoint.updatedAt,
    })
    .from(outboundWebhookEndpoint)
    .where(eq(outboundWebhookEndpoint.organizationId, organizationId))
    .orderBy(desc(outboundWebhookEndpoint.createdAt));
  assertOrganizationScope(organizationId, rows);
  return rows;
}

export async function getWebhookEndpointForOrganization(organizationId: string, endpointId: string) {
  const [row] = await database()
    .select()
    .from(outboundWebhookEndpoint)
    .where(
      and(
        eq(outboundWebhookEndpoint.id, endpointId),
        eq(outboundWebhookEndpoint.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (row) assertOrganizationScope(organizationId, [row]);
  return row ?? null;
}

export async function updateWebhookEndpointForOrganization(input: {
  organizationId: string;
  endpointId: string;
  name?: string;
  url?: string;
  eventTypes?: string[];
  status?: 'active' | 'disabled';
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const [row] = await database()
    .update(outboundWebhookEndpoint)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.url !== undefined ? { url: input.url } : {}),
      ...(input.eventTypes !== undefined ? { eventTypes: input.eventTypes } : {}),
      ...(input.status !== undefined
        ? { status: input.status, disabledAt: input.status === 'disabled' ? now : null }
        : {}),
      updatedAt: now,
    })
    .where(
      and(
        eq(outboundWebhookEndpoint.id, input.endpointId),
        eq(outboundWebhookEndpoint.organizationId, input.organizationId),
        isNull(outboundWebhookEndpoint.deletedAt),
      ),
    )
    .returning();
  if (row) assertOrganizationScope(input.organizationId, [row]);
  return row ?? null;
}

export async function rotateWebhookEndpointSecret(input: {
  organizationId: string;
  endpointId: string;
  secretCiphertext: string;
  secretIv: string;
  secretTag: string;
  secretVersion: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const [row] = await database()
    .update(outboundWebhookEndpoint)
    .set({
      secretCiphertext: input.secretCiphertext,
      secretIv: input.secretIv,
      secretTag: input.secretTag,
      secretVersion: input.secretVersion,
      updatedAt: now,
    })
    .where(
      and(
        eq(outboundWebhookEndpoint.id, input.endpointId),
        eq(outboundWebhookEndpoint.organizationId, input.organizationId),
        isNull(outboundWebhookEndpoint.deletedAt),
      ),
    )
    .returning({ id: outboundWebhookEndpoint.id, organizationId: outboundWebhookEndpoint.organizationId });
  if (row) assertOrganizationScope(input.organizationId, [row]);
  return row ?? null;
}

export async function softDeleteWebhookEndpoint(organizationId: string, endpointId: string, now = new Date()) {
  const [row] = await database()
    .update(outboundWebhookEndpoint)
    .set({ status: 'deleted', deletedAt: now, disabledAt: now, updatedAt: now })
    .where(
      and(
        eq(outboundWebhookEndpoint.id, endpointId),
        eq(outboundWebhookEndpoint.organizationId, organizationId),
        isNull(outboundWebhookEndpoint.deletedAt),
      ),
    )
    .returning({ id: outboundWebhookEndpoint.id, organizationId: outboundWebhookEndpoint.organizationId });
  if (row) assertOrganizationScope(organizationId, [row]);
  return row ?? null;
}

export async function createWebhookDeliveriesForEvent(input: {
  organizationId: string;
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
}) {
  const db = database();
  const endpoints = await db
    .select({
      id: outboundWebhookEndpoint.id,
      organizationId: outboundWebhookEndpoint.organizationId,
      eventTypes: outboundWebhookEndpoint.eventTypes,
    })
    .from(outboundWebhookEndpoint)
    .where(
      and(
        eq(outboundWebhookEndpoint.organizationId, input.organizationId),
        eq(outboundWebhookEndpoint.status, 'active'),
        isNull(outboundWebhookEndpoint.deletedAt),
      ),
    );
  assertOrganizationScope(input.organizationId, endpoints);
  const subscribed = endpoints.filter((endpoint) => endpointAcceptsEvent(endpoint.eventTypes, input.eventType));
  if (subscribed.length === 0) return [];

  const rows = await db
    .insert(outboundWebhookDelivery)
    .values(
      subscribed.map((endpoint) => ({
        id: randomUUID(),
        organizationId: input.organizationId,
        endpointId: endpoint.id,
        eventId: input.eventId,
        eventType: input.eventType,
        payload: input.payload,
      })),
    )
    .onConflictDoNothing()
    .returning({
      id: outboundWebhookDelivery.id,
      organizationId: outboundWebhookDelivery.organizationId,
      endpointId: outboundWebhookDelivery.endpointId,
    });
  assertOrganizationScope(input.organizationId, rows);
  return rows;
}

export async function getWebhookDeliveryForWorker(deliveryId: string) {
  const [row] = await database()
    .select({
      id: outboundWebhookDelivery.id,
      organizationId: outboundWebhookDelivery.organizationId,
      endpointId: outboundWebhookDelivery.endpointId,
      eventId: outboundWebhookDelivery.eventId,
      eventType: outboundWebhookDelivery.eventType,
      payload: outboundWebhookDelivery.payload,
      deliveryStatus: outboundWebhookDelivery.status,
      attemptCount: outboundWebhookDelivery.attemptCount,
      endpointStatus: outboundWebhookEndpoint.status,
      endpointDeletedAt: outboundWebhookEndpoint.deletedAt,
      url: outboundWebhookEndpoint.url,
      secretCiphertext: outboundWebhookEndpoint.secretCiphertext,
      secretIv: outboundWebhookEndpoint.secretIv,
      secretTag: outboundWebhookEndpoint.secretTag,
      secretVersion: outboundWebhookEndpoint.secretVersion,
    })
    .from(outboundWebhookDelivery)
    .innerJoin(outboundWebhookEndpoint, eq(outboundWebhookEndpoint.id, outboundWebhookDelivery.endpointId))
    .where(eq(outboundWebhookDelivery.id, deliveryId))
    .limit(1);
  return row ?? null;
}

export async function beginWebhookDeliveryAttempt(deliveryId: string, now = new Date()) {
  const [row] = await database()
    .update(outboundWebhookDelivery)
    .set({
      status: 'processing',
      attemptCount: sql`${outboundWebhookDelivery.attemptCount} + 1`,
      lastAttemptAt: now,
      lastError: null,
      updatedAt: now,
    })
    .where(eq(outboundWebhookDelivery.id, deliveryId))
    .returning({
      id: outboundWebhookDelivery.id,
      organizationId: outboundWebhookDelivery.organizationId,
      attemptCount: outboundWebhookDelivery.attemptCount,
    });
  return row ?? null;
}

export async function markWebhookDeliverySucceeded(input: {
  deliveryId: string;
  endpointId: string;
  responseStatus: number;
  responseBodyPreview: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const db = database();
  await db.transaction(async (tx) => {
    await tx
      .update(outboundWebhookDelivery)
      .set({
        status: 'succeeded',
        responseStatus: input.responseStatus,
        responseBodyPreview: input.responseBodyPreview.slice(0, 4096),
        lastError: null,
        deliveredAt: now,
        updatedAt: now,
      })
      .where(eq(outboundWebhookDelivery.id, input.deliveryId));
    await tx
      .update(outboundWebhookEndpoint)
      .set({ lastDeliveryAt: now, updatedAt: now })
      .where(eq(outboundWebhookEndpoint.id, input.endpointId));
  });
}

export async function markWebhookDeliveryFailed(input: {
  deliveryId: string;
  error: unknown;
  responseStatus?: number | null;
  responseBodyPreview?: string | null;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const message = input.error instanceof Error ? input.error.message : String(input.error);
  await database()
    .update(outboundWebhookDelivery)
    .set({
      status: 'failed',
      responseStatus: input.responseStatus ?? null,
      responseBodyPreview: input.responseBodyPreview?.slice(0, 4096) ?? null,
      lastError: message.slice(0, 1000),
      updatedAt: now,
    })
    .where(eq(outboundWebhookDelivery.id, input.deliveryId));
}

export async function markWebhookDeliveryDead(deliveryId: string, now = new Date()) {
  await database()
    .update(outboundWebhookDelivery)
    .set({ status: 'dead', deadAt: now, updatedAt: now })
    .where(eq(outboundWebhookDelivery.id, deliveryId));
}

export async function markWebhookDeliveryCancelled(deliveryId: string, now = new Date()) {
  await database()
    .update(outboundWebhookDelivery)
    .set({ status: 'cancelled', updatedAt: now })
    .where(eq(outboundWebhookDelivery.id, deliveryId));
}

export async function listWebhookDeliveriesForOrganization(input: {
  organizationId: string;
  limit?: number;
  cursor?: string | null;
  endpointId?: string | null;
  status?: string | null;
}) {
  const limit = normalizePlatformListLimit(input.limit);
  const cursor = decodePlatformCursor(input.cursor);
  const conditions = [eq(outboundWebhookDelivery.organizationId, input.organizationId)];
  if (input.endpointId?.trim()) conditions.push(eq(outboundWebhookDelivery.endpointId, input.endpointId.trim()));
  if (input.status?.trim()) conditions.push(eq(outboundWebhookDelivery.status, input.status.trim().slice(0, 50)));
  if (cursor) {
    conditions.push(
      or(
        lt(outboundWebhookDelivery.createdAt, cursor.createdAt),
        and(
          eq(outboundWebhookDelivery.createdAt, cursor.createdAt),
          lt(outboundWebhookDelivery.id, cursor.id),
        ),
      )!,
    );
  }

  const rows = await database()
    .select({
      id: outboundWebhookDelivery.id,
      organizationId: outboundWebhookDelivery.organizationId,
      endpointId: outboundWebhookDelivery.endpointId,
      endpointName: outboundWebhookEndpoint.name,
      eventId: outboundWebhookDelivery.eventId,
      eventType: outboundWebhookDelivery.eventType,
      status: outboundWebhookDelivery.status,
      attemptCount: outboundWebhookDelivery.attemptCount,
      responseStatus: outboundWebhookDelivery.responseStatus,
      lastError: outboundWebhookDelivery.lastError,
      lastAttemptAt: outboundWebhookDelivery.lastAttemptAt,
      deliveredAt: outboundWebhookDelivery.deliveredAt,
      deadAt: outboundWebhookDelivery.deadAt,
      createdAt: outboundWebhookDelivery.createdAt,
    })
    .from(outboundWebhookDelivery)
    .innerJoin(outboundWebhookEndpoint, eq(outboundWebhookEndpoint.id, outboundWebhookDelivery.endpointId))
    .where(and(...conditions))
    .orderBy(desc(outboundWebhookDelivery.createdAt), desc(outboundWebhookDelivery.id))
    .limit(limit + 1);
  assertOrganizationScope(input.organizationId, rows);
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);
  return {
    items,
    nextCursor: hasMore && last ? encodePlatformCursor({ createdAt: last.createdAt, id: last.id }) : null,
  };
}
