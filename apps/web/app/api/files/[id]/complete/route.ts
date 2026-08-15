import {
  getStoredFileForOrganization,
  markStoredFileFailed,
  markStoredFileUploaded,
} from '@factory/db';
import { enqueueFileIngestion } from '@factory/jobs';
import { deleteStoredObject, headStoredObject, validateStoredObject } from '@factory/storage';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  const organizationId = session?.session.activeOrganizationId;
  if (!session || !organizationId) {
    return Response.json({ error: 'Authentication and an active workspace are required.' }, { status: 401 });
  }

  const { id } = await context.params;
  const file = await getStoredFileForOrganization(organizationId, id);
  if (!file || file.status === 'deleted') return Response.json({ error: 'File not found.' }, { status: 404 });
  if (file.status === 'ready') return Response.json({ file: { id: file.id, status: file.status } });
  if (file.status === 'processing') {
    return Response.json({ file: { id: file.id, status: file.status } }, { status: 202 });
  }

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
    await markStoredFileFailed(organizationId, file.id, error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Uploaded object validation failed.' },
      { status: 422 },
    );
  }

  const uploaded = await markStoredFileUploaded({
    organizationId,
    fileId: file.id,
    actualSizeBytes: actual.sizeBytes,
    eTag: actual.eTag,
  });
  if (!uploaded) {
    return Response.json({ error: 'File could not transition to uploaded state.' }, { status: 409 });
  }

  try {
    const job = await enqueueFileIngestion({ organizationId, fileId: file.id });
    return Response.json(
      { file: { id: file.id, status: 'uploaded' }, job: { id: job.id, deduplicated: job.deduplicated } },
      { status: 202 },
    );
  } catch (error) {
    return Response.json(
      {
        error: 'Upload is valid, but the background queue is unavailable. Retry this completion request.',
        details: error instanceof Error ? error.message : undefined,
        file: { id: file.id, status: 'uploaded' },
      },
      { status: 503 },
    );
  }
}
