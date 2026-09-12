import { mobileFilesResponseSchema } from '@factory/contracts';
import { listStoredFilesForOrganization } from '@factory/db';
import { getActiveOrganizationContext } from '@/lib/organization-access';

export async function GET(request: Request) {
  const context = await getActiveOrganizationContext(request.headers);
  if (!context) {
    return Response.json({ error: 'Authentication and an active workspace are required.' }, { status: 401 });
  }

  const files = await listStoredFilesForOrganization(context.organization.id, 100);
  const response = mobileFilesResponseSchema.parse({
    items: files.map((file) => ({
      id: file.id,
      originalName: file.originalName,
      contentType: file.contentType,
      status: file.status,
      sizeBytes: file.actualSizeBytes ?? file.expectedSizeBytes,
      createdAt: file.createdAt.toISOString(),
      processedAt: file.processedAt?.toISOString() ?? null,
    })),
  });

  return Response.json(response, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
