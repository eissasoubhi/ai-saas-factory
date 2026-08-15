import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, vector } from 'drizzle-orm/pg-core';
import { organization, storedFile } from './schema';

export const documentChunk = pgTable(
  'document_chunk',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
    fileId: text('file_id').notNull().references(() => storedFile.id, { onDelete: 'cascade' }),
    chunkIndex: integer('chunk_index').notNull(),
    content: text('content').notNull(),
    characterStart: integer('character_start').notNull(),
    characterEnd: integer('character_end').notNull(),
    tokenEstimate: integer('token_estimate').notNull(),
    embeddingModelId: text('embedding_model_id').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }).notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('document_chunk_file_index_uidx').on(table.fileId, table.chunkIndex),
    index('document_chunk_org_file_idx').on(table.organizationId, table.fileId),
    index('document_chunk_org_created_idx').on(table.organizationId, table.createdAt),
  ],
);
