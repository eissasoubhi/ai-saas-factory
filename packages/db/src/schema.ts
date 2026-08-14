import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  ...timestamps,
});

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    activeOrganizationId: text('active_organization_id'),
    ...timestamps,
  },
  (table) => [index('session_user_id_idx').on(table.userId), index('session_token_idx').on(table.token)],
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    ...timestamps,
  },
  (table) => [index('account_user_id_idx').on(table.userId)],
);

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);

export const organization = pgTable(
  'organization',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    logo: text('logo'),
    metadata: text('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('organization_slug_uidx').on(table.slug)],
);

export const member = pgTable(
  'member',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('member'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('member_org_user_uidx').on(table.organizationId, table.userId),
    index('member_user_id_idx').on(table.userId),
    index('member_organization_id_idx').on(table.organizationId),
  ],
);

export const invitation = pgTable(
  'invitation',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role'),
    status: text('status').notNull().default('pending'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    inviterId: text('inviter_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('invitation_email_idx').on(table.email),
    index('invitation_organization_id_idx').on(table.organizationId),
  ],
);

export const subscription = pgTable(
  'subscription',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull().default('stripe'),
    providerCustomerId: text('provider_customer_id'),
    providerSubscriptionId: text('provider_subscription_id'),
    providerPriceId: text('provider_price_id'),
    providerUpdatedAt: timestamp('provider_updated_at', { withTimezone: true }),
    plan: text('plan').notNull().default('free'),
    status: text('status').notNull().default('inactive'),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('subscription_org_uidx').on(table.organizationId),
    uniqueIndex('subscription_provider_customer_uidx').on(table.providerCustomerId),
    uniqueIndex('subscription_provider_subscription_uidx').on(table.providerSubscriptionId),
  ],
);

export const conversation = pgTable(
  'conversation',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
    createdByUserId: text('created_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    modelId: text('model_id').notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index('conversation_org_updated_idx').on(table.organizationId, table.updatedAt),
    index('conversation_org_archived_idx').on(table.organizationId, table.archivedAt),
  ],
);

export const conversationMessage = pgTable(
  'conversation_message',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id').notNull().references(() => conversation.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    content: text('content').notNull(),
    modelId: text('model_id'),
    providerMessageId: text('provider_message_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('conversation_message_conversation_created_idx').on(table.conversationId, table.createdAt),
    index('conversation_message_org_created_idx').on(table.organizationId, table.createdAt),
  ],
);

export const aiGeneration = pgTable(
  'ai_generation',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
    conversationId: text('conversation_id').notNull().references(() => conversation.id, { onDelete: 'cascade' }),
    requestMessageId: text('request_message_id').references(() => conversationMessage.id, { onDelete: 'set null' }),
    responseMessageId: text('response_message_id').references(() => conversationMessage.id, { onDelete: 'set null' }),
    provider: text('provider').notNull(),
    modelId: text('model_id').notNull(),
    finishReason: text('finish_reason'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    totalTokens: integer('total_tokens'),
    estimatedCostMicros: integer('estimated_cost_micros'),
    durationMs: integer('duration_ms'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('ai_generation_org_created_idx').on(table.organizationId, table.createdAt),
    index('ai_generation_conversation_created_idx').on(table.conversationId, table.createdAt),
  ],
);

export const usageEvent = pgTable(
  'usage_event',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
    actorUserId: text('actor_user_id').references(() => user.id, { onDelete: 'set null' }),
    metric: text('metric').notNull(),
    quantity: integer('quantity').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('usage_event_idempotency_uidx').on(table.idempotencyKey),
    index('usage_event_org_created_idx').on(table.organizationId, table.createdAt),
  ],
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').references(() => organization.id, { onDelete: 'cascade' }),
    actorUserId: text('actor_user_id').references(() => user.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('audit_org_created_idx').on(table.organizationId, table.createdAt)],
);

export const webhookEvent = pgTable(
  'webhook_event',
  {
    id: text('id').primaryKey(),
    provider: text('provider').notNull(),
    providerEventId: text('provider_event_id').notNull(),
    eventType: text('event_type').notNull(),
    processed: boolean('processed').notNull().default(false),
    attemptCount: integer('attempt_count').notNull().default(0),
    processingStartedAt: timestamp('processing_started_at', { withTimezone: true }),
    lastError: text('last_error'),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (table) => [uniqueIndex('webhook_provider_event_uidx').on(table.provider, table.providerEventId)],
);