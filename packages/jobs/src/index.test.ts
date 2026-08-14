import { describe, expect, it } from 'vitest';
import { FILE_VERIFY_QUEUE, FileVerifyJobSchema } from './index';

describe('file verification job contract', () => {
  it('keeps the payload tenant-scoped and free of storage credentials/keys', () => {
    expect(FileVerifyJobSchema.parse({ organizationId: 'org-a', fileId: 'file-a' })).toEqual({
      organizationId: 'org-a',
      fileId: 'file-a',
    });
    expect(FILE_VERIFY_QUEUE).toBe('file.verify');
  });

  it('rejects incomplete payloads', () => {
    expect(() => FileVerifyJobSchema.parse({ fileId: 'file-a' })).toThrow();
    expect(() => FileVerifyJobSchema.parse({ organizationId: '', fileId: 'file-a' })).toThrow();
  });

  it('strips unexpected object keys rather than trusting worker storage coordinates', () => {
    expect(
      FileVerifyJobSchema.parse({
        organizationId: 'org-a',
        fileId: 'file-a',
        objectKey: 'org/another-tenant/private.pdf',
      }),
    ).toEqual({ organizationId: 'org-a', fileId: 'file-a' });
  });
});
