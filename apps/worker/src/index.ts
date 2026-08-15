import {
  getStoredFileForOrganization,
  markStoredFileFailed,
  markStoredFileProcessing,
  recordUsage,
  replaceDocumentChunks,
} from '@factory/db';
import { chunkDocumentText, documentLimits, extractDocumentText } from '@factory/documents';
import { embedTexts } from '@factory/embeddings';
import { createFileWorkerBoss, FILE_INGEST_QUEUE, FileIngestJobSchema } from '@factory/jobs';
import {
  deleteStoredObject,
  headStoredObject,
  readStoredObjectBytes,
  validateStoredObject,
} from '@factory/storage';

async function processFileJob(data: unknown) {
  const payload = FileIngestJobSchema.parse(data);
  const file = await getStoredFileForOrganization(payload.organizationId, payload.fileId);
  if (!file || file.status === 'deleted') return;
  if (file.status === 'uploading') {
    throw new Error(`File ${file.id} has not completed its upload handshake yet`);
  }

  const processing = await markStoredFileProcessing(payload.organizationId, payload.fileId);
  if (!processing) return;

  let actual;
  try {
    actual = await headStoredObject({ key: file.objectKey });
    validateStoredObject({
      expectedContentType: file.contentType,
      expectedSizeBytes: file.expectedSizeBytes,
      actual,
    });
  } catch (error) {
    await deleteStoredObject({ key: file.objectKey }).catch(() => undefined);
    await markStoredFileFailed(payload.organizationId, payload.fileId, error);
    return;
  }

  try {
    const bytes = await readStoredObjectBytes({ key: file.objectKey });
    const limits = documentLimits();
    const extracted = await extractDocumentText({ contentType: file.contentType, bytes });
    const chunks = chunkDocumentText(extracted.text, {
      chunkChars: limits.chunkChars,
      overlapChars: limits.chunkOverlapChars,
    });
    if (chunks.length === 0) throw new Error('Document produced no indexable chunks');

    const embedded = await embedTexts(chunks.map((chunk) => chunk.content));
    if (embedded.embeddings.length !== chunks.length) {
      throw new Error(
        `Embedding provider returned ${embedded.embeddings.length} vectors for ${chunks.length} chunks`,
      );
    }

    await replaceDocumentChunks({
      organizationId: payload.organizationId,
      fileId: payload.fileId,
      chunks: chunks.map((chunk, index) => {
        const embedding = embedded.embeddings[index];
        if (!embedding) throw new Error(`Missing embedding for chunk ${index}`);
        return {
          ...chunk,
          embedding,
          embeddingModelId: embedded.modelId,
          metadata: {
            originalName: file.originalName,
            contentType: file.contentType,
            ...(extracted.pageCount != null ? { pageCount: extracted.pageCount } : {}),
          },
        };
      }),
    });

    if (embedded.tokens > 0) {
      await recordUsage({
        organizationId: payload.organizationId,
        actorUserId: file.createdByUserId,
        metric: 'ai.embedding_tokens',
        quantity: embedded.tokens,
        idempotencyKey: `rag-embedding/${payload.organizationId}/${file.id}/${actual.eTag ?? file.eTag ?? 'no-etag'}/${embedded.modelId}`,
        metadata: { fileId: file.id, modelId: embedded.modelId, chunks: chunks.length },
      });
    }
  } catch (error) {
    await markStoredFileFailed(payload.organizationId, payload.fileId, error);
    throw error;
  }
}

async function main() {
  const boss = await createFileWorkerBoss();
  const workerId = await boss.work(FILE_INGEST_QUEUE, async (jobs) => {
    for (const job of jobs) await processFileJob(job.data);
  });

  console.log(`AI SaaS Factory worker listening on ${FILE_INGEST_QUEUE} (${workerId})`);

  let stopping = false;
  async function stop(signal: string) {
    if (stopping) return;
    stopping = true;
    console.log(`Stopping worker after ${signal}`);
    await boss.stop({ graceful: true });
    process.exitCode = 0;
  }

  process.once('SIGINT', () => void stop('SIGINT'));
  process.once('SIGTERM', () => void stop('SIGTERM'));
}

main().catch((error) => {
  console.error('Worker failed to start', error);
  process.exitCode = 1;
});
