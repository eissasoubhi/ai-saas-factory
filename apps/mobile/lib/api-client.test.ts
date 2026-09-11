import { describe, expect, it } from 'vitest';
import { withSessionCookie } from './http-headers';

describe('withSessionCookie', () => {
  it('preserves caller headers and adds the Better Auth cookie', () => {
    const headers = withSessionCookie({ Accept: 'application/json' }, 'better-auth.session=abc');
    expect(headers.get('Accept')).toBe('application/json');
    expect(headers.get('Cookie')).toBe('better-auth.session=abc');
  });

  it('does not emit an empty cookie header', () => {
    const headers = withSessionCookie(undefined, null);
    expect(headers.has('Cookie')).toBe(false);
  });
});
