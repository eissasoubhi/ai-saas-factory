import { describe, expect, it } from 'vitest';
import { FILE_INGEST_QUEUE, FileIngestJobSchema } from './index';

describe('file ingestion job contract', () => {
  it('keeps the payload tenant-scoped and free of storage credentials/keys', () => {
    expect(FileIngestJobSchema.parse({ organizationId: 'org-a', fileId: 'file-a' })).toEqual({
      organizationId: 'org-a',
      fileId: 'file-a',
    });
    expect(FILE_INGEST_QUEUE).toBe('file.ingest');
  });

  it('rejects incomplete payloads', () => {
    expect(() => FileIngestJobSchema.parse({ fileId: 'file-a' })).toThrow();
    expect(() => FileIngestJobSchema.parse({ organizationId: '', fileId: 'file-a' })).toThrow();
  });

  it('strips unexpected object keys rather than trusting worker storage coordinates', () => {
    expect(
      FileIngestJobSchema.parse({
        organizationId: 'org-a',
        fileId: 'file-a',
        objectKey: 'org/another-tenant/private.pdf',
      }),
    ).toEqual({ organizationId: 'org-a', fileId: 'file-a' });
  });
});
