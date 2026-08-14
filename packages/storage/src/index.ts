import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export type StorageConfig = {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle: boolean;
  signedUrlTtlSeconds: number;
  maxUploadBytes: number;
  allowedContentTypes: ReadonlySet<string>;
};

export type UploadPolicyResult = {
  contentType: string;
  expectedSizeBytes: number;
};

export type StoredObjectMetadata = {
  sizeBytes: number;
  contentType: string | null;
  eTag: string | null;
};

const DEFAULT_ALLOWED_CONTENT_TYPES = [
  'application/json',
  'application/pdf',
  'text/csv',
  'text/markdown',
  'text/plain',
];

let cachedClient: { configKey: string; client: S3Client } | null = null;

function required(name: string, value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function positiveInteger(name: string, value: string | undefined, fallback: number, max: number) {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > max) {
    throw new Error(`${name} must be an integer between 1 and ${max}`);
  }
  return parsed;
}

function optionalBoolean(value: string | undefined, fallback = false) {
  if (!value?.trim()) return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error('Boolean storage configuration values must be true or false');
}

export function storageConfig(env: NodeJS.ProcessEnv = process.env): StorageConfig {
  const accessKeyId = env.STORAGE_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.STORAGE_SECRET_ACCESS_KEY?.trim();
  if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
    throw new Error('STORAGE_ACCESS_KEY_ID and STORAGE_SECRET_ACCESS_KEY must be configured together');
  }

  const allowed = (env.STORAGE_ALLOWED_CONTENT_TYPES ?? DEFAULT_ALLOWED_CONTENT_TYPES.join(','))
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) throw new Error('STORAGE_ALLOWED_CONTENT_TYPES cannot be empty');

  return {
    bucket: required('STORAGE_BUCKET', env.STORAGE_BUCKET),
    region: required('STORAGE_REGION', env.STORAGE_REGION),
    ...(env.STORAGE_ENDPOINT?.trim() ? { endpoint: env.STORAGE_ENDPOINT.trim() } : {}),
    ...(accessKeyId ? { accessKeyId } : {}),
    ...(secretAccessKey ? { secretAccessKey } : {}),
    forcePathStyle: optionalBoolean(env.STORAGE_FORCE_PATH_STYLE),
    signedUrlTtlSeconds: positiveInteger('STORAGE_SIGNED_URL_TTL_SECONDS', env.STORAGE_SIGNED_URL_TTL_SECONDS, 300, 3_600),
    maxUploadBytes: positiveInteger('STORAGE_MAX_UPLOAD_BYTES', env.STORAGE_MAX_UPLOAD_BYTES, 25 * 1024 * 1024, 5 * 1024 * 1024 * 1024),
    allowedContentTypes: new Set(allowed),
  };
}

function clientFor(config: StorageConfig) {
  const configKey = JSON.stringify({
    region: config.region,
    endpoint: config.endpoint ?? null,
    accessKeyId: config.accessKeyId ?? null,
    forcePathStyle: config.forcePathStyle,
  });
  if (cachedClient?.configKey === configKey) return cachedClient.client;

  const client = new S3Client({
    region: config.region,
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    ...(config.accessKeyId && config.secretAccessKey
      ? { credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } }
      : {}),
    forcePathStyle: config.forcePathStyle,
  });
  cachedClient = { configKey, client };
  return client;
}

function opaqueSegment(value: string) {
  if (!value) throw new Error('Storage key segments cannot be empty');
  return Buffer.from(value, 'utf8').toString('base64url');
}

function normalizedContentType(value: string | null | undefined) {
  return value?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
}

export function safeFilename(filename: string) {
  const normalized = filename
    .normalize('NFKC')
    .replace(/[\\/\0]/g, '-')
    .replace(/[^\p{L}\p{N}._ -]+/gu, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 120);
  return normalized || 'file';
}

export function storageObjectKey(input: { organizationId: string; fileId: string; filename: string }) {
  return `org/${opaqueSegment(input.organizationId)}/files/${opaqueSegment(input.fileId)}/${safeFilename(input.filename)}`;
}

export function validateUploadPolicy(
  input: { contentType: string; sizeBytes: number },
  config: Pick<StorageConfig, 'allowedContentTypes' | 'maxUploadBytes'>,
): UploadPolicyResult {
  const contentType = normalizedContentType(input.contentType);
  if (!contentType || !config.allowedContentTypes.has(contentType)) {
    throw new Error(`Content type ${contentType || '(missing)'} is not allowed`);
  }
  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes <= 0) {
    throw new Error('Upload size must be a positive integer');
  }
  if (input.sizeBytes > config.maxUploadBytes) {
    throw new Error(`Upload exceeds the ${config.maxUploadBytes}-byte limit`);
  }
  return { contentType, expectedSizeBytes: input.sizeBytes };
}

export function validateStoredObject(input: {
  expectedContentType: string;
  expectedSizeBytes: number;
  actual: StoredObjectMetadata;
}) {
  if (input.actual.sizeBytes !== input.expectedSizeBytes) {
    throw new Error(`Uploaded object size mismatch: expected ${input.expectedSizeBytes}, received ${input.actual.sizeBytes}`);
  }
  const actualContentType = normalizedContentType(input.actual.contentType);
  if (actualContentType !== normalizedContentType(input.expectedContentType)) {
    throw new Error(`Uploaded object content type mismatch: expected ${input.expectedContentType}, received ${actualContentType || '(missing)'}`);
  }
  return input.actual;
}

export async function createPresignedUpload(input: {
  key: string;
  contentType: string;
  metadata?: Record<string, string>;
  config?: StorageConfig;
}) {
  const config = input.config ?? storageConfig();
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: input.key,
    ContentType: input.contentType,
    ...(input.metadata ? { Metadata: input.metadata } : {}),
  });
  const url = await getSignedUrl(clientFor(config), command, { expiresIn: config.signedUrlTtlSeconds });
  return { url, expiresInSeconds: config.signedUrlTtlSeconds };
}

export async function headStoredObject(input: { key: string; config?: StorageConfig }): Promise<StoredObjectMetadata> {
  const config = input.config ?? storageConfig();
  const response = await clientFor(config).send(new HeadObjectCommand({ Bucket: config.bucket, Key: input.key }));
  return {
    sizeBytes: response.ContentLength ?? 0,
    contentType: response.ContentType ?? null,
    eTag: response.ETag?.replace(/^"|"$/g, '') ?? null,
  };
}

export async function createPresignedDownload(input: {
  key: string;
  filename: string;
  config?: StorageConfig;
}) {
  const config = input.config ?? storageConfig();
  const dispositionName = safeFilename(input.filename).replace(/"/g, '');
  const command = new GetObjectCommand({
    Bucket: config.bucket,
    Key: input.key,
    ResponseContentDisposition: `attachment; filename="${dispositionName}"`,
  });
  const url = await getSignedUrl(clientFor(config), command, { expiresIn: config.signedUrlTtlSeconds });
  return { url, expiresInSeconds: config.signedUrlTtlSeconds };
}

export async function deleteStoredObject(input: { key: string; config?: StorageConfig }) {
  const config = input.config ?? storageConfig();
  await clientFor(config).send(new DeleteObjectCommand({ Bucket: config.bucket, Key: input.key }));
}
