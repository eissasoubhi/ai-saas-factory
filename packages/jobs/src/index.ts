import { PgBoss } from 'pg-boss';
import { z } from 'zod';

export const FILE_VERIFY_QUEUE = 'file.verify';
export const FILE_VERIFY_DLQ = 'file.verify.dlq';

export const FileVerifyJobSchema = z.object({
  organizationId: z.string().min(1),
  fileId: z.string().min(1),
});

export type FileVerifyJob = z.infer<typeof FileVerifyJobSchema>;

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

export async function enqueueFileVerification(payload: FileVerifyJob) {
  const data = FileVerifyJobSchema.parse(payload);
  const boss = await jobProducer();
  const id = await boss.send(FILE_VERIFY_QUEUE, data, {
    singletonKey: data.fileId,
    retryLimit: 5,
    retryDelay: 5,
    retryBackoff: true,
  });
  return { id, deduplicated: id === null };
}

export async function createFileWorkerBoss() {
  const boss = createBoss('worker');
  await boss.start();
  await boss.createQueue(FILE_VERIFY_DLQ);
  await boss.createQueue(FILE_VERIFY_QUEUE, {
    policy: 'singleton',
    retryLimit: 5,
    retryDelay: 5,
    retryBackoff: true,
    deadLetter: FILE_VERIFY_DLQ,
  });
  return boss;
}
