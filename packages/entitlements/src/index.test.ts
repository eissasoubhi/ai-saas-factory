import { describe, expect, it } from 'vitest';
import { allows, entitlement } from './index';

describe('entitlements', () => {
  it('keeps API keys out of the free plan', () => {
    expect(allows('free', 'api_keys')).toBe(false);
  });

  it('gives pro more AI requests than starter', () => {
    expect(Number(entitlement('pro', 'ai_requests_monthly'))).toBeGreaterThan(
      Number(entitlement('starter', 'ai_requests_monthly')),
    );
  });
});
