import { describe, expect, it } from 'vitest';
import { githubOAuthEnabled, githubOAuthProvider } from './oauth';

describe('GitHub OAuth configuration', () => {
  it('is disabled when both credentials are absent', () => {
    expect(githubOAuthProvider({})).toBeNull();
    expect(githubOAuthEnabled({})).toBe(false);
  });

  it('returns trimmed credentials when both are configured', () => {
    expect(
      githubOAuthProvider({
        GITHUB_OAUTH_CLIENT_ID: ' client-id ',
        GITHUB_OAUTH_CLIENT_SECRET: ' client-secret ',
      }),
    ).toEqual({ clientId: 'client-id', clientSecret: 'client-secret' });
  });

  it('fails closed when only one credential is configured', () => {
    expect(() => githubOAuthProvider({ GITHUB_OAUTH_CLIENT_ID: 'client-id' })).toThrow(
      'GitHub OAuth requires both GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET',
    );
    expect(() => githubOAuthProvider({ GITHUB_OAUTH_CLIENT_SECRET: 'client-secret' })).toThrow(
      'GitHub OAuth requires both GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET',
    );
  });
});
