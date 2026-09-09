import { bigint, index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { usageCreditLedger } from './credits-schema';
import { organization } from './schema';

export const stripeMeterSubmission = pgTable(
  'stripe_meter_submission',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    ledgerEntryId: text('ledger_entry_id')
      .notNull()
      .references(() => usageCreditLedger.id, { onDelete: 'cascade' }),
    periodKey: text('period_key').notNull(),
    providerCustomerId: text('provider_customer_id').notNull(),
    eventName: text('event_name').notNull(),
    valueMicros: bigint('value_micros', { mode: 'number' }).notNull(),
    providerIdentifier: text('provider_identifier').notNull(),
    meteredAt: timestamp('metered_at', { withTimezone: true }).notNull(),
    status: text('status').notNull().default('pending'),
    attemptCount: integer('attempt_count').notNull().default(0),
    lastError: text('last_error'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('stripe_meter_submission_ledger_entry_uidx').on(table.ledgerEntryId),
    uniqueIndex('stripe_meter_submission_provider_identifier_uidx').on(table.providerIdentifier),
    index('stripe_meter_submission_org_period_status_idx').on(
      table.organizationId,
      table.periodKey,
      table.status,
    ),
  ],
);
