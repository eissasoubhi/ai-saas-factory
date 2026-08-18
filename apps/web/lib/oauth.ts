export type GitHubOAuthEnv = {
  GITHUB_OAUTH_CLIENT_ID?: string;
  GITHUB_OAUTH_CLIENT_SECRET?: string;
};

export type GitHubOAuthProvider = {
  clientId: string;
  clientSecret: string;
};

export function githubOAuthProvider(env: GitHubOAuthEnv = process.env): GitHubOAuthProvider | null {
  const clientId = env.GITHUB_OAUTH_CLIENT_ID?.trim() ?? '';
  const clientSecret = env.GITHUB_OAUTH_CLIENT_SECRET?.trim() ?? '';

  if (!clientId && !clientSecret) return null;
  if (!clientId || !clientSecret) {
    throw new Error('GitHub OAuth requires both GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET');
  }

  return { clientId, clientSecret };
}

export function githubOAuthEnabled(env: GitHubOAuthEnv = process.env) {
  return githubOAuthProvider(env) !== null;
}
