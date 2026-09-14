import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateApiKey } from '@factory/platform-security';

const dbMocks = vi.hoisted(() => ({
  getApiKeyForAuthentication: vi.fn(),
  touchApiKeyLastUsed: vi.fn(),
}));

vi.mock('@factory/db', () => ({
  getApiKeyForAuthentication: dbMocks.getApiKeyForAuthentication,
  touchApiKeyLastUsed: dbMocks.touchApiKeyLastUsed,
}));

import { authenticateApiKey } from './api-key-auth';

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.touchApiKeyLastUsed.mockResolvedValue(undefined);
});

describe('API key authentication tenant boundary', () => {
  it('derives organization scope only from the persisted API key record', async () => {
    const generated = generateApiKey();
    dbMocks.getApiKeyForAuthentication.mockResolvedValue({
      id: generated.id,
      organizationId: 'org-server-owned',
      keyHash: generated.hash,
      scopes: ['files:read'],
    });

    const headers = new Headers({
      authorization: `Bearer ${generated.token}`,
      'x-organization-id': 'org-attacker-controlled',
    });
    const result = await authenticateApiKey(headers, 'files:read');

    expect(result).toEqual({
      ok: true,
      principal: {
        keyId: generated.id,
        organizationId: 'org-server-owned',
        scopes: ['files:read'],
      },
    });
    expect(dbMocks.touchApiKeyLastUsed).toHaveBeenCalledWith(generated.id);
  });

  it('rejects a valid key that lacks the required scope without touching last-used metadata', async () => {
    const generated = generateApiKey();
    dbMocks.getApiKeyForAuthentication.mockResolvedValue({
      id: generated.id,
      organizationId: 'org-a',
      keyHash: generated.hash,
      scopes: ['files:write'],
    });

    const result = await authenticateApiKey(
      new Headers({ authorization: `Bearer ${generated.token}` }),
      'files:read',
    );

    expect(result).toEqual({
      ok: false,
      status: 403,
      error: 'The API key does not grant files:read.',
    });
    expect(dbMocks.touchApiKeyLastUsed).not.toHaveBeenCalled();
  });

  it('rejects malformed bearer material before querying persistence', async () => {
    const result = await authenticateApiKey(
      new Headers({ authorization: 'Bearer not-an-ai-saas-factory-key' }),
      'files:read',
    );

    expect(result).toEqual({ ok: false, status: 401, error: 'The API key format is invalid.' });
    expect(dbMocks.getApiKeyForAuthentication).not.toHaveBeenCalled();
  });
});
