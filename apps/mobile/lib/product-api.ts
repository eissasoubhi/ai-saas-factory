import type { MobileFilesResponse, MobileOverviewResponse } from '@factory/contracts';
import { mobileJson } from './api-client';

export function getMobileOverview() {
  return mobileJson<MobileOverviewResponse>('/api/mobile/overview');
}

export function getMobileFiles() {
  return mobileJson<MobileFilesResponse>('/api/mobile/files');
}
