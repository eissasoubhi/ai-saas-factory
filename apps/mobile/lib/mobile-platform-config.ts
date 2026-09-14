export type NativeMobilePlatform = 'ios' | 'android';

function requiredPublicValue(name: string, env: NodeJS.ProcessEnv) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required for this mobile feature`);
  return value;
}

export function revenueCatPublicApiKey(
  platform: NativeMobilePlatform,
  env: NodeJS.ProcessEnv = process.env,
) {
  const name = platform === 'ios'
    ? 'EXPO_PUBLIC_REVENUECAT_IOS_API_KEY'
    : 'EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY';
  const value = requiredPublicValue(name, env);
  if (/^(sk_|secret_|rk_)/i.test(value)) {
    throw new Error(`${name} appears to contain a server-side secret and must not be bundled into the app`);
  }
  return value;
}

export function easProjectId(env: NodeJS.ProcessEnv = process.env) {
  const value = requiredPublicValue('EXPO_PUBLIC_EAS_PROJECT_ID', env);
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(value)) {
    throw new Error('EXPO_PUBLIC_EAS_PROJECT_ID has an invalid format');
  }
  return value;
}

export function mobileProviderConfig(platform: NativeMobilePlatform, env: NodeJS.ProcessEnv = process.env) {
  return {
    revenueCatApiKey: revenueCatPublicApiKey(platform, env),
    easProjectId: easProjectId(env),
  };
}
