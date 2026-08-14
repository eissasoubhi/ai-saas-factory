import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { database } from './index';
import { storedFile } from './schema';

export type StoredFileStatus = 'uploading' | 'uploaded' | 'processing' | 'ready' | 'failed' | 'deleted';

export async function createStoredFile(input: {
  id?: string;
  organizationId: string;
  createdByUserId: string;
  objectKey: string;
  originalName: string;
  contentType: string;
  expectedSizeBytes: number;
  purpose?: string;
}) {
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
      lastError: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(storedFile.id, input.fileId),
        eq(storedFile.organizationId, input.organizationId),
        inArray(storedFile.status, ['uploading', 'uploaded']),
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
        inArray(storedFile.status, ['uploaded', 'processing', 'failed']),
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
        inArray(storedFile.status, ['uploaded', 'processing', 'failed']),
      ),
    )
    .returning();
  return row ?? null;
}

export async function markStoredFileDeleted(organizationId: string, fileId: string) {
  const db = database();
  const now = new Date();
  const [row] = await db
    .update(storedFile)
    .set({ status: 'deleted', deletedAt: now, processingStartedAt: null, updatedAt: now })
    .where(and(eq(storedFile.id, fileId), eq(storedFile.organizationId, organizationId)))
    .returning();
  return row ?? null;
}
