export const MOBILE_APP_SCHEME = 'ai-saas-factory';

export function mobileApiBaseUrl(input: {
  value?: string | null;
  production?: boolean;
} = {}) {
  const value = input.value ?? process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('EXPO_PUBLIC_API_URL must be an absolute URL');
  }

  const production = input.production ?? process.env.NODE_ENV === 'production';
  if (production && url.protocol !== 'https:') {
    throw new Error('EXPO_PUBLIC_API_URL must use https in production');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('EXPO_PUBLIC_API_URL must use http or https');
  }

  return url.origin;
}
