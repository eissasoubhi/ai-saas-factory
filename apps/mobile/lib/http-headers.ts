export function withSessionCookie(headers: HeadersInit | undefined, cookie: string | null | undefined) {
  const result = new Headers(headers);
  if (cookie) result.set('Cookie', cookie);
  return result;
}
