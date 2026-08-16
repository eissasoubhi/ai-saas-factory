import {
  getStoredFileForOrganization,
  markStoredFileFailed,
  markStoredFileProcessing,
  recordUsage,
  replaceDocumentChunks,
} from '@factory/db';
import { chunkDocumentText, documentLimits, extractDocumentText } from '@factory/documents';
import { embedTexts } from '@factory/embeddings';
import {
  createWorkerBoss,
  FILE_INGEST_QUEUE,
  FileIngestJobSchema,
  OUTBOUND_WEBHOOK_DELIVERY_DLQ,
  OUTBOUND_WEBHOOK_DELIVERY_QUEUE,
} from '@factory/jobs';
import {
  deleteStoredObject,
  headStoredObject,
  readStoredObjectBytes,
  validateStoredObject,
} from '@factory/storage';
import { emitTelemetry } from '@factory/telemetry';
import { processOutboundWebhookDeadLetter, processOutboundWebhookDelivery } from './webhook-delivery';

async function processFileJob(data: unknown) {
  const payload = FileIngestJobSchema.parse(data);
  const file = await getStoredFileForOrganization(payload.organizationId, payload.fileId);
  if (!file || file.status === 'deleted') return { ...payload, status: 'skipped', chunkCount: 0 } as const;
  if (file.status === 'uploading') {
    throw new Error(`File ${file.id} has not completed its upload handshake yet`);
  }

  const processing = await markStoredFileProcessing(payload.organizationId, payload.fileId);
  if (!processing) return { ...payload, status: 'skipped', chunkCount: 0 } as const;

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
    return { ...payload, status: 'rejected', chunkCount: 0 } as const;
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
          chunkIndex: chunk.index,
          content: chunk.content,
          characterStart: chunk.characterStart,
          characterEnd: chunk.characterEnd,
          tokenEstimate: chunk.tokenEstimate,
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

    return {
      ...payload,
      status: 'ready',
      chunkCount: chunks.length,
      embeddingTokens: embedded.tokens,
      embeddingModelId: embedded.modelId,
    } as const;
  } catch (error) {
    await markStoredFileFailed(payload.organizationId, payload.fileId, error);
    throw error;
  }
}

async function main() {
  const boss = await createWorkerBoss();
  const fileWorkerId = await boss.work(FILE_INGEST_QUEUE, async (jobs) => {
    for (const job of jobs) {
      const startedAt = Date.now();
      const correlationId = String(job.id);
      try {
        const result = await processFileJob(job.data);
        emitTelemetry({
          name: 'worker.file_ingest.completed',
          component: 'worker',
          correlationId,
          durationMs: Date.now() - startedAt,
          organizationId: result.organizationId,
          attributes: {
            fileId: result.fileId,
            status: result.status,
            chunkCount: result.chunkCount,
            ...('embeddingTokens' in result ? { embeddingTokens: result.embeddingTokens } : {}),
            ...('embeddingModelId' in result ? { modelId: result.embeddingModelId } : {}),
          },
        });
      } catch (error) {
        const parsed = FileIngestJobSchema.safeParse(job.data);
        emitTelemetry({
          name: 'worker.file_ingest.failed',
          level: 'error',
          component: 'worker',
          correlationId,
          durationMs: Date.now() - startedAt,
          ...(parsed.success ? { organizationId: parsed.data.organizationId } : {}),
          attributes: parsed.success ? { fileId: parsed.data.fileId } : { invalidPayload: true },
          error,
        });
        throw error;
      }
    }
  });

  const webhookWorkerId = await boss.work(OUTBOUND_WEBHOOK_DELIVERY_QUEUE, async (jobs) => {
    for (const job of jobs) {
      await processOutboundWebhookDelivery(job.data, String(job.id));
    }
  });

  const webhookDeadLetterWorkerId = await boss.work(OUTBOUND_WEBHOOK_DELIVERY_DLQ, async (jobs) => {
    for (const job of jobs) {
      await processOutboundWebhookDeadLetter(job.data, String(job.id));
    }
  });

  emitTelemetry({
    name: 'worker.started',
    component: 'worker',
    correlationId: String(fileWorkerId),
    attributes: {
      queues: [FILE_INGEST_QUEUE, OUTBOUND_WEBHOOK_DELIVERY_QUEUE, OUTBOUND_WEBHOOK_DELIVERY_DLQ],
      webhookWorkerId: String(webhookWorkerId),
      webhookDeadLetterWorkerId: String(webhookDeadLetterWorkerId),
    },
  });

  let stopping = false;
  async function stop(signal: string) {
    if (stopping) return;
    stopping = true;
    emitTelemetry({ name: 'worker.stopping', component: 'worker', attributes: { signal } });
    await boss.stop({ graceful: true });
    process.exitCode = 0;
  }

  process.once('SIGINT', () => void stop('SIGINT'));
  process.once('SIGTERM', () => void stop('SIGTERM'));
}

main().catch((error) => {
  emitTelemetry({ name: 'worker.start_failed', level: 'error', component: 'worker', error });
  process.exitCode = 1;
});
