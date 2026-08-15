import { getStoredFileForOrganization } from '@factory/db';
import { createPresignedDownload } from '@factory/storage';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  const organizationId = session?.session.activeOrganizationId;
  if (!session || !organizationId) {
    return Response.json({ error: 'Authentication and an active workspace are required.' }, { status: 401 });
  }

  const { id } = await context.params;
  const file = await getStoredFileForOrganization(organizationId, id);
  if (!file || file.status === 'deleted') return Response.json({ error: 'File not found.' }, { status: 404 });
  if (file.status !== 'ready') {
    return Response.json({ error: `File is ${file.status}; downloads are available only when ready.` }, { status: 409 });
  }

  try {
    const download = await createPresignedDownload({ key: file.objectKey, filename: file.originalName });
    return Response.json({
      file: { id: file.id, filename: file.originalName, contentType: file.contentType, sizeBytes: file.actualSizeBytes },
      download,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unable to create download URL.' },
      { status: 503 },
    );
  }
}
