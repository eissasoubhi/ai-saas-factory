import { listStoredFilesForOrganization } from '@factory/db';
import { authenticateApiKey } from '@/lib/api-key-auth';

export async function GET(request: Request) {
  const auth = await authenticateApiKey(request.headers, 'files:read');
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const files = await listStoredFilesForOrganization(auth.principal.organizationId, 100);
  return Response.json({
    data: files.map((file) => ({
      id: file.id,
      name: file.originalName,
      contentType: file.contentType,
      sizeBytes: file.actualSizeBytes ?? file.expectedSizeBytes,
      purpose: file.purpose,
      status: file.status,
      createdAt: file.createdAt.toISOString(),
      processedAt: file.processedAt?.toISOString() ?? null,
    })),
  });
}
