import { describe, expect, it } from 'vitest';
import { mobileApiBaseUrl } from './config';

describe('mobileApiBaseUrl', () => {
  it('accepts local http in development', () => {
    expect(mobileApiBaseUrl({ value: 'http://localhost:3000/path', production: false })).toBe(
      'http://localhost:3000',
    );
  });

  it('requires https in production', () => {
    expect(() =>
      mobileApiBaseUrl({ value: 'http://api.example.com', production: true }),
    ).toThrow('must use https');
    expect(mobileApiBaseUrl({ value: 'https://api.example.com', production: true })).toBe(
      'https://api.example.com',
    );
  });

  it('rejects non-http protocols', () => {
    expect(() => mobileApiBaseUrl({ value: 'file:///tmp/api', production: false })).toThrow(
      'must use http or https',
    );
  });
});
