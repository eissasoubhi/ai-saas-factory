import { describe, expect, it } from 'vitest';
import { decideStorageReservation, storageRetrievalQuota } from './rag-quotas';

describe('storage and retrieval quotas', () => {
  it('increases storage and retrieval capacity by plan', () => {
    const free = storageRetrievalQuota('free');
    const starter = storageRetrievalQuota('starter');
    const pro = storageRetrievalQuota('pro');

    expect(starter.fileCount).toBeGreaterThan(free.fileCount);
    expect(pro.fileCount).toBeGreaterThan(starter.fileCount);
    expect(starter.bytes).toBeGreaterThan(free.bytes);
    expect(pro.bytes).toBeGreaterThan(starter.bytes);
    expect(free.retrievalTopK).toBeLessThanOrEqual(starter.retrievalTopK);
    expect(starter.retrievalTopK).toBeLessThanOrEqual(pro.retrievalTopK);
    expect(pro.retrievalTopK).toBeLessThanOrEqual(20);
  });

  it('allows the exact file and byte boundary', () => {
    const quota = { fileCount: 5, bytes: 1_000, retrievalTopK: 3 };
    expect(
      decideStorageReservation({
        currentFileCount: 4,
        currentBytes: 900,
        requestedBytes: 100,
        quota,
      }),
    ).toEqual({
      allowed: true,
      fileCountAfterReservation: 5,
      bytesAfterReservation: 1_000,
    });
  });

  it('distinguishes file-count and byte-limit rejections', () => {
    const quota = { fileCount: 5, bytes: 1_000, retrievalTopK: 3 };
    expect(
      decideStorageReservation({
        currentFileCount: 5,
        currentBytes: 100,
        requestedBytes: 10,
        quota,
      }),
    ).toMatchObject({ allowed: false, reason: 'file_count_limit' });
    expect(
      decideStorageReservation({
        currentFileCount: 1,
        currentBytes: 950,
        requestedBytes: 51,
        quota,
      }),
    ).toMatchObject({ allowed: false, reason: 'storage_bytes_limit' });
  });

  it('rejects invalid accounting inputs', () => {
    expect(() =>
      decideStorageReservation({
        currentFileCount: -1,
        currentBytes: 0,
        requestedBytes: 1,
        quota: storageRetrievalQuota('free'),
      }),
    ).toThrow();
  });
});
