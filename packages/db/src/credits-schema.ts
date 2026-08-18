import { bigint, index, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { organization, user } from './schema';

export const usageCreditLedger = pgTable(
  'usage_credit_ledger',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    actorUserId: text('actor_user_id').references(() => user.id, { onDelete: 'set null' }),
    periodKey: text('period_key').notNull(),
    kind: text('kind').notNull(),
    amountMicros: bigint('amount_micros', { mode: 'number' }).notNull(),
    source: text('source').notNull(),
    referenceId: text('reference_id'),
    idempotencyKey: text('idempotency_key').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    effectiveAt: timestamp('effective_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('usage_credit_ledger_idempotency_uidx').on(table.idempotencyKey),
    index('usage_credit_ledger_org_period_effective_idx').on(
      table.organizationId,
      table.periodKey,
      table.effectiveAt,
    ),
  ],
);
