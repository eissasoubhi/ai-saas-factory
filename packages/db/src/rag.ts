import { randomUUID } from 'node:crypto';
import { storageRetrievalQuota } from '@factory/entitlements';
import { and, cosineDistance, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { assertOrganizationScope } from './ai-policy';
import { database } from './index';
import { documentChunk } from './rag-schema';
import { storedFile, subscription } from './schema';

export type PersistedDocumentChunk = {
  chunkIndex: number;
  content: string;
  characterStart: number;
  characterEnd: number;
  tokenEstimate: number;
  embeddingModelId: string;
  embedding: number[];
  metadata?: Record<string, unknown>;
};

export async function replaceDocumentChunks(input: {
  organizationId: string;
  fileId: string;
  chunks: PersistedDocumentChunk[];
}) {
  if (input.chunks.length === 0) throw new Error('At least one document chunk is required');
  for (const chunk of input.chunks) {
    if (chunk.embedding.length !== 1536) {
      throw new Error(`Chunk ${chunk.chunkIndex} has ${chunk.embedding.length} embedding dimensions; expected 1536`);
    }
  }

  const db = database();
  return db.transaction(async (tx) => {
    const lockKey = `rag-file:${input.organizationId}:${input.fileId}`;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);

    const [file] = await tx
      .select({ id: storedFile.id })
      .from(storedFile)
      .where(
        and(
          eq(storedFile.id, input.fileId),
          eq(storedFile.organizationId, input.organizationId),
          isNull(storedFile.deletedAt),
        ),
      )
      .limit(1);
    if (!file) throw new Error('Stored file is unavailable for indexing');

    await tx
      .delete(documentChunk)
      .where(
        and(
          eq(documentChunk.fileId, input.fileId),
          eq(documentChunk.organizationId, input.organizationId),
        ),
      );

    await tx.insert(documentChunk).values(
      input.chunks.map((chunk) => ({
        id: randomUUID(),
        organizationId: input.organizationId,
        fileId: input.fileId,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        characterStart: chunk.characterStart,
        characterEnd: chunk.characterEnd,
        tokenEstimate: chunk.tokenEstimate,
        embeddingModelId: chunk.embeddingModelId,
        embedding: chunk.embedding,
        metadata: chunk.metadata,
      })),
    );

    const now = new Date();
    const [ready] = await tx
      .update(storedFile)
      .set({
        status: 'ready',
        processedAt: now,
        processingStartedAt: null,
        lastError: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(storedFile.id, input.fileId),
          eq(storedFile.organizationId, input.organizationId),
          isNull(storedFile.deletedAt),
        ),
      )
      .returning({ id: storedFile.id });
    if (!ready) throw new Error('Stored file could not transition to ready after indexing');

    return { fileId: ready.id, chunkCount: input.chunks.length };
  });
}

export async function deleteDocumentChunksForFile(organizationId: string, fileId: string) {
  const db = database();
  const rows = await db
    .delete(documentChunk)
    .where(and(eq(documentChunk.organizationId, organizationId), eq(documentChunk.fileId, fileId)))
    .returning({ id: documentChunk.id });
  return rows.length;
}

function activePlanFromSubscription(
  row: { plan: string; status: string } | null | undefined,
): 'free' | 'starter' | 'pro' {
  if (!row || (row.status !== 'active' && row.status !== 'trialing')) return 'free';
  if (row.plan === 'starter' || row.plan === 'pro') return row.plan;
  return 'free';
}

export async function searchDocumentChunks(input: {
  organizationId: string;
  embedding: number[];
  limit?: number;
  minSimilarity?: number;
}) {
  if (input.embedding.length !== 1536) {
    throw new Error(`Query embedding has ${input.embedding.length} dimensions; expected 1536`);
  }
  const db = database();
  const [subscriptionSnapshot] = await db
    .select({ plan: subscription.plan, status: subscription.status })
    .from(subscription)
    .where(eq(subscription.organizationId, input.organizationId))
    .limit(1);
  const plan = activePlanFromSubscription(subscriptionSnapshot);
  const quota = storageRetrievalQuota(plan);
  const requestedLimit = Math.min(Math.max(input.limit ?? 6, 1), 20);
  const limit = Math.min(requestedLimit, quota.retrievalTopK);
  const minSimilarity = Math.min(Math.max(input.minSimilarity ?? 0.3, -1), 1);
  const similarity = sql<number>`1 - (${cosineDistance(documentChunk.embedding, input.embedding)})`;

  const rows = await db
    .select({
      organizationId: documentChunk.organizationId,
      chunkId: documentChunk.id,
      fileId: documentChunk.fileId,
      fileName: storedFile.originalName,
      chunkIndex: documentChunk.chunkIndex,
      content: documentChunk.content,
      metadata: documentChunk.metadata,
      similarity,
    })
    .from(documentChunk)
    .innerJoin(
      storedFile,
      and(
        eq(storedFile.id, documentChunk.fileId),
        eq(storedFile.organizationId, documentChunk.organizationId),
      ),
    )
    .where(
      and(
        eq(documentChunk.organizationId, input.organizationId),
        eq(storedFile.organizationId, input.organizationId),
        eq(storedFile.status, 'ready'),
        isNull(storedFile.deletedAt),
        gt(similarity, minSimilarity),
      ),
    )
    .orderBy(desc(similarity))
    .limit(limit);

  assertOrganizationScope(input.organizationId, rows);
  return rows;
}
