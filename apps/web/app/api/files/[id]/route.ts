import { getStoredFileForOrganization, markStoredFileDeleted } from '@factory/db';
import { deleteStoredObject } from '@factory/storage';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  const organizationId = session?.session.activeOrganizationId;
  if (!session || !organizationId) {
    return Response.json({ error: 'Authentication and an active workspace are required.' }, { status: 401 });
  }

  const { id } = await context.params;
  const file = await getStoredFileForOrganization(organizationId, id);
  if (!file) return Response.json({ error: 'File not found.' }, { status: 404 });
  if (file.status === 'deleted') return new Response(null, { status: 204 });

  try {
    await deleteStoredObject({ key: file.objectKey });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unable to delete stored object.' },
      { status: 503 },
    );
  }

  await markStoredFileDeleted(organizationId, file.id);
  return new Response(null, { status: 204 });
}
