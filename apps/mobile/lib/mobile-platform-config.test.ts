import { describe, expect, it } from 'vitest';
import { easProjectId, mobileProviderConfig, revenueCatPublicApiKey } from './mobile-platform-config';

describe('mobile provider configuration', () => {
  it('selects the platform-specific RevenueCat public key', () => {
    const env = {
      EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: 'appl_public_ios',
      EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY: 'goog_public_android',
      EXPO_PUBLIC_EAS_PROJECT_ID: '12345678-abcd-4321-abcd-123456789012',
    };

    expect(revenueCatPublicApiKey('ios', env)).toBe('appl_public_ios');
    expect(revenueCatPublicApiKey('android', env)).toBe('goog_public_android');
    expect(mobileProviderConfig('ios', env)).toEqual({
      revenueCatApiKey: 'appl_public_ios',
      easProjectId: '12345678-abcd-4321-abcd-123456789012',
    });
  });

  it('rejects a value that looks like a server secret in a public RevenueCat variable', () => {
    expect(() =>
      revenueCatPublicApiKey('ios', { EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: 'sk_server_secret' }),
    ).toThrow(/server-side secret/);
  });

  it('requires an explicit EAS project id with a bounded public format', () => {
    expect(() => easProjectId({})).toThrow(/required/);
    expect(() => easProjectId({ EXPO_PUBLIC_EAS_PROJECT_ID: 'bad' })).toThrow(/invalid format/);
  });
});
