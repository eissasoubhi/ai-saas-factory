import { createStoredFile } from '@factory/db';
import {
  createPresignedUpload,
  safeFilename,
  storageConfig,
  storageObjectKey,
  validateUploadPolicy,
} from '@factory/storage';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  const organizationId = session?.session.activeOrganizationId;
  if (!session || !organizationId) {
    return Response.json({ error: 'Authentication and an active workspace are required.' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    filename?: string;
    contentType?: string;
    sizeBytes?: number;
    purpose?: string;
  } | null;
  const filename = body?.filename?.trim();
  if (!filename || filename.length > 255) {
    return Response.json({ error: 'filename is required and must be at most 255 characters.' }, { status: 400 });
  }
  if (body?.purpose && body.purpose !== 'knowledge') {
    return Response.json({ error: 'Only the knowledge file purpose is supported in this edition.' }, { status: 400 });
  }

  let config: ReturnType<typeof storageConfig>;
  let policy: ReturnType<typeof validateUploadPolicy>;
  try {
    config = storageConfig();
    policy = validateUploadPolicy(
      { contentType: body?.contentType ?? '', sizeBytes: body?.sizeBytes ?? 0 },
      config,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid upload configuration.';
    const configurationError = message.startsWith('STORAGE_') || message.includes('storage configuration');
    return Response.json({ error: message }, { status: configurationError ? 503 : 400 });
  }

  const fileId = crypto.randomUUID();
  const objectKey = storageObjectKey({ organizationId, fileId, filename });

  let upload;
  try {
    upload = await createPresignedUpload({
      key: objectKey,
      contentType: policy.contentType,
      metadata: { 'file-id': fileId },
      config,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unable to create upload URL.' },
      { status: 503 },
    );
  }

  await createStoredFile({
    id: fileId,
    organizationId,
    createdByUserId: session.user.id,
    objectKey,
    originalName: safeFilename(filename),
    contentType: policy.contentType,
    expectedSizeBytes: policy.expectedSizeBytes,
    purpose: 'knowledge',
  });

  return Response.json({
    file: {
      id: fileId,
      filename: safeFilename(filename),
      contentType: policy.contentType,
      sizeBytes: policy.expectedSizeBytes,
      status: 'uploading',
    },
    upload: {
      method: 'PUT',
      url: upload.url,
      headers: { 'Content-Type': policy.contentType },
      expiresInSeconds: upload.expiresInSeconds,
    },
  });
}
