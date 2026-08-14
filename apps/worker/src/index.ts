import {
  getStoredFileForOrganization,
  markStoredFileFailed,
  markStoredFileProcessing,
  markStoredFileReady,
} from '@factory/db';
import { createFileWorkerBoss, FILE_VERIFY_QUEUE, FileVerifyJobSchema } from '@factory/jobs';
import { deleteStoredObject, headStoredObject, validateStoredObject } from '@factory/storage';

async function verifyFileJob(data: unknown) {
  const payload = FileVerifyJobSchema.parse(data);
  const file = await getStoredFileForOrganization(payload.organizationId, payload.fileId);
  if (!file || file.status === 'deleted' || file.status === 'ready') return;
  if (file.status === 'uploading') {
    throw new Error(`File ${file.id} has not completed its upload handshake yet`);
  }

  await markStoredFileProcessing(payload.organizationId, payload.fileId);

  let actual;
  try {
    actual = await headStoredObject({ key: file.objectKey });
  } catch (error) {
    await markStoredFileFailed(payload.organizationId, payload.fileId, error);
    throw error;
  }

  try {
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

  const ready = await markStoredFileReady(payload.organizationId, payload.fileId);
  if (!ready) throw new Error(`File ${file.id} could not transition to ready state`);
}

async function main() {
  const boss = await createFileWorkerBoss();
  const workerId = await boss.work(FILE_VERIFY_QUEUE, async (jobs) => {
    for (const job of jobs) await verifyFileJob(job.data);
  });

  console.log(`AI SaaS Factory worker listening on ${FILE_VERIFY_QUEUE} (${workerId})`);

  let stopping = false;
  async function stop(signal: string) {
    if (stopping) return;
    stopping = true;
    console.log(`Stopping worker after ${signal}`);
    await boss.stop({ graceful: true, wait: true });
    process.exitCode = 0;
  }

  process.once('SIGINT', () => void stop('SIGINT'));
  process.once('SIGTERM', () => void stop('SIGTERM'));
}

main().catch((error) => {
  console.error('Worker failed to start', error);
  process.exitCode = 1;
});
