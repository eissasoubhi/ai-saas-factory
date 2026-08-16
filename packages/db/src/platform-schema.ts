import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { organization, user } from './schema';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const apiKey = pgTable(
  'api_key',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
    createdByUserId: text('created_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    keyPrefix: text('key_prefix').notNull(),
    keyHash: text('key_hash').notNull(),
    scopes: jsonb('scopes').$type<string[]>().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('api_key_hash_uidx').on(table.keyHash),
    index('api_key_org_created_idx').on(table.organizationId, table.createdAt),
    index('api_key_org_revoked_idx').on(table.organizationId, table.revokedAt),
  ],
);

export const outboundWebhookEndpoint = pgTable(
  'outbound_webhook_endpoint',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
    createdByUserId: text('created_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    url: text('url').notNull(),
    status: text('status').notNull().default('active'),
    eventTypes: jsonb('event_types').$type<string[]>().notNull(),
    secretCiphertext: text('secret_ciphertext').notNull(),
    secretIv: text('secret_iv').notNull(),
    secretTag: text('secret_tag').notNull(),
    secretVersion: integer('secret_version').notNull().default(1),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    lastDeliveryAt: timestamp('last_delivery_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index('outbound_webhook_endpoint_org_created_idx').on(table.organizationId, table.createdAt),
    index('outbound_webhook_endpoint_org_status_idx').on(table.organizationId, table.status),
  ],
);

export const outboundWebhookDelivery = pgTable(
  'outbound_webhook_delivery',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
    endpointId: text('endpoint_id').notNull().references(() => outboundWebhookEndpoint.id, { onDelete: 'cascade' }),
    eventId: text('event_id').notNull(),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    status: text('status').notNull().default('queued'),
    attemptCount: integer('attempt_count').notNull().default(0),
    responseStatus: integer('response_status'),
    responseBodyPreview: text('response_body_preview'),
    lastError: text('last_error'),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    deadAt: timestamp('dead_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('outbound_webhook_delivery_endpoint_event_uidx').on(table.endpointId, table.eventId),
    index('outbound_webhook_delivery_org_created_idx').on(table.organizationId, table.createdAt),
    index('outbound_webhook_delivery_endpoint_created_idx').on(table.endpointId, table.createdAt),
    index('outbound_webhook_delivery_org_status_idx').on(table.organizationId, table.status),
  ],
);
