import type { PlanId } from '@factory/contracts';

export type StorageRetrievalQuota = {
  fileCount: number;
  bytes: number;
  retrievalTopK: number;
};

export const storageRetrievalQuotas: Record<PlanId, StorageRetrievalQuota> = {
  free: {
    fileCount: 5,
    bytes: 25 * 1024 * 1024,
    retrievalTopK: 3,
  },
  starter: {
    fileCount: 100,
    bytes: 1024 * 1024 * 1024,
    retrievalTopK: 6,
  },
  pro: {
    fileCount: 1_000,
    bytes: 10 * 1024 * 1024 * 1024,
    retrievalTopK: 10,
  },
};

export function storageRetrievalQuota(plan: PlanId) {
  return storageRetrievalQuotas[plan];
}

export type StorageReservationDecision =
  | {
      allowed: true;
      fileCountAfterReservation: number;
      bytesAfterReservation: number;
    }
  | {
      allowed: false;
      reason: 'file_count_limit' | 'storage_bytes_limit';
      fileCountAfterReservation: number;
      bytesAfterReservation: number;
    };

export function decideStorageReservation(input: {
  currentFileCount: number;
  currentBytes: number;
  requestedBytes: number;
  quota: StorageRetrievalQuota;
}): StorageReservationDecision {
  for (const value of [input.currentFileCount, input.currentBytes, input.requestedBytes]) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error('Storage quota inputs must be non-negative safe integers');
    }
  }

  const fileCountAfterReservation = input.currentFileCount + 1;
  const bytesAfterReservation = input.currentBytes + input.requestedBytes;
  if (!Number.isSafeInteger(bytesAfterReservation)) {
    throw new Error('Storage reservation exceeds the safe integer range');
  }

  if (fileCountAfterReservation > input.quota.fileCount) {
    return {
      allowed: false,
      reason: 'file_count_limit',
      fileCountAfterReservation,
      bytesAfterReservation,
    };
  }
  if (bytesAfterReservation > input.quota.bytes) {
    return {
      allowed: false,
      reason: 'storage_bytes_limit',
      fileCountAfterReservation,
      bytesAfterReservation,
    };
  }
  return { allowed: true, fileCountAfterReservation, bytesAfterReservation };
}
