import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { database } from './index';
import { documentChunk } from './rag-schema';
import { storedFile } from './schema';

export type StoredFileStatus = 'uploading' | 'uploaded' | 'processing' | 'ready' | 'failed' | 'deleted';

type CreateStoredFileInput = {
  id?: string;
  organizationId: string;
  createdByUserId: string;
  objectKey: string;
  originalName: string;
  contentType: string;
  expectedSizeBytes: number;
  purpose?: string;
};

export async function createStoredFile(input: CreateStoredFileInput) {
  const db = database();
  const [row] = await db
    .insert(storedFile)
    .values({
      id: input.id ?? randomUUID(),
      organizationId: input.organizationId,
      createdByUserId: input.createdByUserId,
      objectKey: input.objectKey,
      originalName: input.originalName,
      contentType: input.contentType,
      expectedSizeBytes: input.expectedSizeBytes,
      purpose: input.purpose ?? 'knowledge',
      status: 'uploading',
    })
    .returning();
  if (!row) throw new Error('Unable to create stored file');
  return row;
}

export type StoredFileQuota = {
  fileCount: number;
  bytes: number;
};

export type StoredFileQuotaReservation =
  | {
      allowed: true;
      file: typeof storedFile.$inferSelect;
      currentFileCount: number;
      currentBytes: number;
      fileCountAfterReservation: number;
      bytesAfterReservation: number;
    }
  | {
      allowed: false;
      reason: 'file_count_limit' | 'storage_bytes_limit';
      currentFileCount: number;
      currentBytes: number;
      fileCountAfterReservation: number;
      bytesAfterReservation: number;
    };

export async function createStoredFileWithinQuota(
  input: CreateStoredFileInput & { quota: StoredFileQuota },
): Promise<StoredFileQuotaReservation> {
  if (!Number.isSafeInteger(input.expectedSizeBytes) || input.expectedSizeBytes < 0) {
    throw new Error('Expected file size must be a non-negative safe integer');
  }
  if (!Number.isSafeInteger(input.quota.fileCount) || input.quota.fileCount < 1) {
    throw new Error('Stored file count quota must be a positive safe integer');
  }
  if (!Number.isSafeInteger(input.quota.bytes) || input.quota.bytes < 1) {
    throw new Error('Stored file byte quota must be a positive safe integer');
  }

  const db = database();
  return db.transaction(async (tx) => {
    const lockKey = `storage-quota:${input.organizationId}`;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);

    const [usage] = await tx
      .select({
        fileCount: sql<number>`count(*)`,
        bytes: sql<number>`coalesce(sum(coalesce(${storedFile.actualSizeBytes}, ${storedFile.expectedSizeBytes})), 0)`,
      })
      .from(storedFile)
      .where(and(eq(storedFile.organizationId, input.organizationId), isNull(storedFile.deletedAt)));

    const currentFileCount = Number(usage?.fileCount ?? 0);
    const currentBytes = Number(usage?.bytes ?? 0);
    if (!Number.isSafeInteger(currentFileCount) || !Number.isSafeInteger(currentBytes)) {
      throw new Error('Stored file quota accounting exceeded the safe integer range');
    }
    const fileCountAfterReservation = currentFileCount + 1;
    const bytesAfterReservation = currentBytes + input.expectedSizeBytes;
    if (!Number.isSafeInteger(bytesAfterReservation)) {
      throw new Error('Stored file quota reservation exceeded the safe integer range');
    }

    if (fileCountAfterReservation > input.quota.fileCount) {
      return {
        allowed: false as const,
        reason: 'file_count_limit' as const,
        currentFileCount,
        currentBytes,
        fileCountAfterReservation,
        bytesAfterReservation,
      };
    }
    if (bytesAfterReservation > input.quota.bytes) {
      return {
        allowed: false as const,
        reason: 'storage_bytes_limit' as const,
        currentFileCount,
        currentBytes,
        fileCountAfterReservation,
        bytesAfterReservation,
      };
    }

    const [file] = await tx
      .insert(storedFile)
      .values({
        id: input.id ?? randomUUID(),
        organizationId: input.organizationId,
        createdByUserId: input.createdByUserId,
        objectKey: input.objectKey,
        originalName: input.originalName,
        contentType: input.contentType,
        expectedSizeBytes: input.expectedSizeBytes,
        purpose: input.purpose ?? 'knowledge',
        status: 'uploading',
      })
      .returning();
    if (!file) throw new Error('Unable to reserve stored file');

    return {
      allowed: true as const,
      file,
      currentFileCount,
      currentBytes,
      fileCountAfterReservation,
      bytesAfterReservation,
    };
  });
}

export async function getStoredFileForOrganization(organizationId: string, fileId: string) {
  const db = database();
  const [row] = await db
    .select()
    .from(storedFile)
    .where(and(eq(storedFile.id, fileId), eq(storedFile.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

export async function listStoredFilesForOrganization(organizationId: string, limit = 100) {
  const db = database();
  return db
    .select()
    .from(storedFile)
    .where(and(eq(storedFile.organizationId, organizationId), isNull(storedFile.deletedAt)))
    .orderBy(desc(storedFile.createdAt))
    .limit(Math.min(Math.max(limit, 1), 200));
}

export async function markStoredFileUploaded(input: {
  organizationId: string;
  fileId: string;
  actualSizeBytes: number;
  eTag?: string | null;
}) {
  const db = database();
  const now = new Date();
  const [row] = await db
    .update(storedFile)
    .set({
      actualSizeBytes: input.actualSizeBytes,
      eTag: input.eTag ?? null,
      status: 'uploaded',
      uploadedAt: now,
      processingStartedAt: null,
      lastError: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(storedFile.id, input.fileId),
        eq(storedFile.organizationId, input.organizationId),
        inArray(storedFile.status, ['uploading', 'uploaded', 'failed']),
      ),
    )
    .returning();
  return row ?? null;
}

export async function markStoredFileProcessing(organizationId: string, fileId: string) {
  const db = database();
  const now = new Date();
  const [row] = await db
    .update(storedFile)
    .set({ status: 'processing', processingStartedAt: now, lastError: null, updatedAt: now })
    .where(
      and(
        eq(storedFile.id, fileId),
        eq(storedFile.organizationId, organizationId),
        inArray(storedFile.status, ['uploaded', 'processing', 'ready', 'failed']),
        isNull(storedFile.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

export async function markStoredFileReady(organizationId: string, fileId: string) {
  const db = database();
  const now = new Date();
  const [row] = await db
    .update(storedFile)
    .set({ status: 'ready', processedAt: now, processingStartedAt: null, lastError: null, updatedAt: now })
    .where(
      and(
        eq(storedFile.id, fileId),
        eq(storedFile.organizationId, organizationId),
        eq(storedFile.status, 'processing'),
      ),
    )
    .returning();
  return row ?? null;
}

export async function markStoredFileFailed(organizationId: string, fileId: string, error: unknown) {
  const db = database();
  const now = new Date();
  const message = error instanceof Error ? error.message : String(error);
  const [row] = await db
    .update(storedFile)
    .set({
      status: 'failed',
      processingStartedAt: null,
      lastError: message.slice(0, 4_000),
      updatedAt: now,
    })
    .where(
      and(
        eq(storedFile.id, fileId),
        eq(storedFile.organizationId, organizationId),
        inArray(storedFile.status, ['uploading', 'uploaded', 'processing', 'ready', 'failed']),
        isNull(storedFile.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

export async function markStoredFileDeleted(organizationId: string, fileId: string) {
  const db = database();
  return db.transaction(async (tx) => {
    const lockKey = `rag-file:${organizationId}:${fileId}`;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
    await tx
      .delete(documentChunk)
      .where(and(eq(documentChunk.organizationId, organizationId), eq(documentChunk.fileId, fileId)));

    const now = new Date();
    const [row] = await tx
      .update(storedFile)
      .set({ status: 'deleted', deletedAt: now, processingStartedAt: null, updatedAt: now })
      .where(and(eq(storedFile.id, fileId), eq(storedFile.organizationId, organizationId)))
      .returning();
    return row ?? null;
  });
}
