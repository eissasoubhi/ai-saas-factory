import { getStoredFileForOrganization } from '@factory/db';
import { enqueueFileIngestion } from '@factory/jobs';
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
  if (file.status === 'uploading') {
    return Response.json({ error: 'Complete the upload before indexing this file.' }, { status: 409 });
  }

  try {
    const job = await enqueueFileIngestion({ organizationId, fileId: file.id });
    return Response.json(
      { file: { id: file.id, status: file.status }, job: { id: job.id, deduplicated: job.deduplicated } },
      { status: 202 },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Background ingestion queue is unavailable.' },
      { status: 503 },
    );
  }
}
