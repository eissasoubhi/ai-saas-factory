import { getApiKeyForAuthentication, touchApiKeyLastUsed } from '@factory/db';
import {
  apiKeyHasScope,
  parseApiKey,
  type ApiKeyScope,
  verifyApiKeyHash,
} from '@factory/platform-security';

export type ApiKeyPrincipal = {
  keyId: string;
  organizationId: string;
  scopes: string[];
};

export type ApiKeyAuthenticationResult =
  | { ok: true; principal: ApiKeyPrincipal }
  | { ok: false; status: 401 | 403; error: string };

function bearerToken(headers: Headers) {
  const value = headers.get('authorization')?.trim();
  if (!value) return null;
  const match = /^Bearer\s+(.+)$/i.exec(value);
  return match?.[1]?.trim() || null;
}

export async function authenticateApiKey(
  requestHeaders: Headers,
  requiredScope: ApiKeyScope,
): Promise<ApiKeyAuthenticationResult> {
  const token = bearerToken(requestHeaders);
  if (!token) return { ok: false, status: 401, error: 'A Bearer API key is required.' };

  const parsed = parseApiKey(token);
  if (!parsed) return { ok: false, status: 401, error: 'The API key format is invalid.' };

  const key = await getApiKeyForAuthentication(parsed.id);
  if (!key || !verifyApiKeyHash(parsed.token, key.keyHash)) {
    return { ok: false, status: 401, error: 'The API key is invalid, expired, or revoked.' };
  }
  if (!apiKeyHasScope(key.scopes, requiredScope)) {
    return { ok: false, status: 403, error: `The API key does not grant ${requiredScope}.` };
  }

  await touchApiKeyLastUsed(key.id);
  return {
    ok: true,
    principal: {
      keyId: key.id,
      organizationId: key.organizationId,
      scopes: key.scopes,
    },
  };
}
