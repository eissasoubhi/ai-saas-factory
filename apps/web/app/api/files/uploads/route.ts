import {
  createStoredFileWithinQuota,
  getSubscriptionForOrganization,
  markStoredFileDeleted,
  paidPlanForSubscription,
} from '@factory/db';
import { storageRetrievalQuota } from '@factory/entitlements';
import {
  createPresignedUpload,
  safeFilename,
  storageConfig,
  storageObjectKey,
  validateUploadPolicy,
} from '@factory/storage';
import { correlationIdFromHeaders, emitTelemetry } from '@factory/telemetry';
import { recordAuditEvent } from '@/lib/audit';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const correlationId = correlationIdFromHeaders(request.headers);
  const startedAt = Date.now();
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

  const subscription = await getSubscriptionForOrganization(organizationId);
  const plan = paidPlanForSubscription(subscription);
  const quota = storageRetrievalQuota(plan);
  const fileId = crypto.randomUUID();
  const sanitizedFilename = safeFilename(filename);
  const objectKey = storageObjectKey({ organizationId, fileId, filename });

  const reservation = await createStoredFileWithinQuota({
    id: fileId,
    organizationId,
    createdByUserId: session.user.id,
    objectKey,
    originalName: sanitizedFilename,
    contentType: policy.contentType,
    expectedSizeBytes: policy.expectedSizeBytes,
    purpose: 'knowledge',
    quota: { fileCount: quota.fileCount, bytes: quota.bytes },
  });
  if (!reservation.allowed) {
    emitTelemetry({
      name: 'web.file.storage_quota_rejected',
      level: 'warn',
      component: 'web',
      correlationId,
      durationMs: Date.now() - startedAt,
      organizationId,
      userId: session.user.id,
      attributes: {
        plan,
        reason: reservation.reason,
        currentFileCount: reservation.currentFileCount,
        currentBytes: reservation.currentBytes,
        requestedBytes: policy.expectedSizeBytes,
        fileCountLimit: quota.fileCount,
        byteLimit: quota.bytes,
      },
    });
    return Response.json(
      {
        error:
          reservation.reason === 'file_count_limit'
            ? `Stored file limit reached for the ${plan} plan.`
            : `Storage byte limit reached for the ${plan} plan.`,
        reason: reservation.reason,
        usage: {
          fileCount: reservation.currentFileCount,
          bytes: reservation.currentBytes,
        },
        quota: { fileCount: quota.fileCount, bytes: quota.bytes },
      },
      { status: 409 },
    );
  }

  let upload;
  try {
    upload = await createPresignedUpload({
      key: objectKey,
      contentType: policy.contentType,
      metadata: { 'file-id': fileId },
      config,
    });
  } catch (error) {
    await markStoredFileDeleted(organizationId, fileId).catch(() => undefined);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unable to create upload URL.' },
      { status: 503 },
    );
  }

  await recordAuditEvent({
    organizationId,
    actorUserId: session.user.id,
    action: 'file.upload_initialized',
    entityType: 'file',
    entityId: fileId,
    metadata: {
      contentType: policy.contentType,
      expectedSizeBytes: policy.expectedSizeBytes,
      purpose: 'knowledge',
      plan,
    },
    correlationId,
  });
  emitTelemetry({
    name: 'web.file.upload_initialized',
    component: 'web',
    correlationId,
    durationMs: Date.now() - startedAt,
    organizationId,
    userId: session.user.id,
    attributes: {
      fileId,
      contentType: policy.contentType,
      expectedSizeBytes: policy.expectedSizeBytes,
      purpose: 'knowledge',
      plan,
    },
  });

  return Response.json({
    file: {
      id: fileId,
      filename: sanitizedFilename,
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
