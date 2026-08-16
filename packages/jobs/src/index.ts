import { PgBoss } from 'pg-boss';
import { z } from 'zod';

export const FILE_INGEST_QUEUE = 'file.ingest';
export const FILE_INGEST_DLQ = 'file.ingest.dlq';
export const OUTBOUND_WEBHOOK_DELIVERY_QUEUE = 'outbound.webhook.deliver';
export const OUTBOUND_WEBHOOK_DELIVERY_DLQ = 'outbound.webhook.deliver.dlq';

export const FileIngestJobSchema = z.object({
  organizationId: z.string().min(1),
  fileId: z.string().min(1),
});

export const OutboundWebhookDeliveryJobSchema = z.object({
  deliveryId: z.string().min(1),
});

export type FileIngestJob = z.infer<typeof FileIngestJobSchema>;
export type OutboundWebhookDeliveryJob = z.infer<typeof OutboundWebhookDeliveryJobSchema>;

let producerPromise: Promise<PgBoss> | null = null;

function connectionString() {
  const value = process.env.JOBS_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!value?.trim()) throw new Error('JOBS_DATABASE_URL or DATABASE_URL is required for pg-boss');
  return value;
}

function schemaName() {
  return process.env.JOBS_SCHEMA?.trim() || 'pgboss';
}

function createBoss(mode: 'producer' | 'worker') {
  const worker = mode === 'worker';
  const boss = new PgBoss({
    connectionString: connectionString(),
    schema: schemaName(),
    supervise: worker,
    schedule: false,
    migrate: worker && process.env.JOBS_MIGRATE_ON_START !== 'false',
  });
  boss.on('error', (error) => console.error('pg-boss error', error));
  return boss;
}

export async function jobProducer() {
  producerPromise ??= (async () => {
    const boss = createBoss('producer');
    await boss.start();
    return boss;
  })();
  return producerPromise;
}

export async function stopJobProducer() {
  if (!producerPromise) return;
  const boss = await producerPromise;
  producerPromise = null;
  await boss.stop({ graceful: true });
}

export async function enqueueFileIngestion(payload: FileIngestJob) {
  const data = FileIngestJobSchema.parse(payload);
  const boss = await jobProducer();
  const id = await boss.send(FILE_INGEST_QUEUE, data, {
    singletonKey: data.fileId,
    retryLimit: 5,
    retryDelay: 5,
    retryBackoff: true,
  });
  return { id, deduplicated: id === null };
}

export async function enqueueOutboundWebhookDelivery(payload: OutboundWebhookDeliveryJob) {
  const data = OutboundWebhookDeliveryJobSchema.parse(payload);
  const boss = await jobProducer();
  const id = await boss.send(OUTBOUND_WEBHOOK_DELIVERY_QUEUE, data, {
    singletonKey: data.deliveryId,
    retryLimit: 8,
    retryDelay: 10,
    retryBackoff: true,
  });
  return { id, deduplicated: id === null };
}

export async function createWorkerBoss() {
  const boss = createBoss('worker');
  await boss.start();
  await boss.createQueue(FILE_INGEST_DLQ);
  await boss.createQueue(FILE_INGEST_QUEUE, {
    policy: 'singleton',
    retryLimit: 5,
    retryDelay: 5,
    retryBackoff: true,
    deadLetter: FILE_INGEST_DLQ,
  });
  await boss.createQueue(OUTBOUND_WEBHOOK_DELIVERY_DLQ);
  await boss.createQueue(OUTBOUND_WEBHOOK_DELIVERY_QUEUE, {
    policy: 'singleton',
    retryLimit: 8,
    retryDelay: 10,
    retryBackoff: true,
    deadLetter: OUTBOUND_WEBHOOK_DELIVERY_DLQ,
  });
  return boss;
}

export async function createFileWorkerBoss() {
  return await createWorkerBoss();
}
