import { authClient } from './auth-client';
import { mobileApiBaseUrl } from './config';

export function withSessionCookie(headers: HeadersInit | undefined, cookie: string | null | undefined) {
  const result = new Headers(headers);
  if (cookie) result.set('Cookie', cookie);
  return result;
}

export async function mobileFetch(path: string, init: RequestInit = {}) {
  const cookie = await authClient.getCookie();
  const url = new URL(path, `${mobileApiBaseUrl()}/`);
  return fetch(url, {
    ...init,
    headers: withSessionCookie(init.headers, cookie),
  });
}

export async function mobileJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await mobileFetch(path, init);
  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(message || `API request failed with ${response.status}`);
  }
  return (await response.json()) as T;
}
