import { describe, expect, it } from 'vitest';
import { safeFilename, storageConfig, storageObjectKey, validateUploadPolicy } from './index';

const policy = {
  allowedContentTypes: new Set(['application/pdf', 'text/plain']),
  maxUploadBytes: 10_000,
};

describe('storage object keys', () => {
  it('creates different opaque organization prefixes for the same filename', () => {
    const first = storageObjectKey({ organizationId: 'org-a', fileId: 'file-1', filename: 'Report 2026.pdf' });
    const second = storageObjectKey({ organizationId: 'org-b', fileId: 'file-1', filename: 'Report 2026.pdf' });

    expect(first).not.toBe(second);
    expect(first).not.toContain('org-a');
    expect(second).not.toContain('org-b');
    expect(first).toMatch(/^org\/[A-Za-z0-9_-]+\/files\/[A-Za-z0-9_-]+\/Report-2026\.pdf$/);
  });

  it('removes path separators and control characters from display filenames', () => {
    expect(safeFilename('../secret\\report\0.pdf')).toBe('secret-report-.pdf');
  });
});

describe('upload policy', () => {
  it('normalizes MIME parameters and accepts an allowed upload', () => {
    expect(validateUploadPolicy({ contentType: 'application/pdf; charset=binary', sizeBytes: 5_000 }, policy)).toEqual({
      contentType: 'application/pdf',
      expectedSizeBytes: 5_000,
    });
  });

  it('rejects disallowed content types', () => {
    expect(() => validateUploadPolicy({ contentType: 'application/x-msdownload', sizeBytes: 10 }, policy)).toThrow(/not allowed/);
  });

  it('rejects oversized uploads', () => {
    expect(() => validateUploadPolicy({ contentType: 'text/plain', sizeBytes: 10_001 }, policy)).toThrow(/exceeds/);
  });
});

describe('storage configuration', () => {
  it('requires access key credentials as a pair', () => {
    expect(() => storageConfig({ STORAGE_BUCKET: 'bucket', STORAGE_REGION: 'auto', STORAGE_ACCESS_KEY_ID: 'only-key' } as NodeJS.ProcessEnv)).toThrow(/configured together/);
  });

  it('parses an S3-compatible endpoint without requiring explicit credentials', () => {
    const config = storageConfig({
      STORAGE_BUCKET: 'bucket',
      STORAGE_REGION: 'us-east-1',
      STORAGE_ENDPOINT: 'http://localhost:9000',
      STORAGE_FORCE_PATH_STYLE: 'true',
    } as NodeJS.ProcessEnv);

    expect(config.endpoint).toBe('http://localhost:9000');
    expect(config.forcePathStyle).toBe(true);
  });
});
