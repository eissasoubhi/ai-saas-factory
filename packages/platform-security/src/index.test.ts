import { describe, expect, it } from 'vitest';
import {
  apiKeyHasScope,
  decodeEncryptionKey,
  decryptSecret,
  encryptSecret,
  generateApiKey,
  generateWebhookSecret,
  isPublicIpAddress,
  normalizeApiKeyScopes,
  parseApiKey,
  resolvePublicWebhookTarget,
  signWebhookPayload,
  verifyApiKeyHash,
  verifyWebhookSignature,
} from './index';

describe('API keys', () => {
  it('generates parseable opaque keys and verifies only the matching hash', () => {
    const generated = generateApiKey();
    expect(parseApiKey(generated.token)?.id).toBe(generated.id);
    expect(generated.prefix).toBe(`asf_sk_${generated.id.slice(0, 8)}`);
    expect(verifyApiKeyHash(generated.token, generated.hash)).toBe(true);
    expect(verifyApiKeyHash(`${generated.token}x`, generated.hash)).toBe(false);
  });

  it('normalizes scopes against the explicit allow-list', () => {
    const scopes = normalizeApiKeyScopes(['ai:read', 'ai:read', 'admin:*', 'files:write']);
    expect(scopes).toEqual(['ai:read', 'files:write']);
    expect(apiKeyHasScope(scopes, 'files:write')).toBe(true);
    expect(apiKeyHasScope(scopes, 'webhooks:write')).toBe(false);
  });
});

describe('webhook secrets and signatures', () => {
  it('encrypts secrets at rest and authenticates ciphertext', () => {
    const key = decodeEncryptionKey(Buffer.alloc(32, 7).toString('base64url'));
    const secret = generateWebhookSecret();
    const encrypted = encryptSecret(secret, key);
    expect(decryptSecret(encrypted, key)).toBe(secret);
    expect(() => decryptSecret({ ...encrypted, tag: Buffer.alloc(16).toString('base64url') }, key)).toThrow();
  });

  it('signs the timestamp, event id and exact body', () => {
    const input = { timestamp: 1_700_000_000, eventId: 'evt_123', body: '{"ok":true}' };
    const signature = signWebhookPayload('whsec_test', input);
    expect(verifyWebhookSignature('whsec_test', input, signature)).toBe(true);
    expect(verifyWebhookSignature('whsec_test', { ...input, body: '{"ok":false}' }, signature)).toBe(false);
  });
});

describe('webhook SSRF policy', () => {
  it('classifies private and documentation ranges as non-public', () => {
    expect(isPublicIpAddress('127.0.0.1')).toBe(false);
    expect(isPublicIpAddress('10.0.0.1')).toBe(false);
    expect(isPublicIpAddress('169.254.1.1')).toBe(false);
    expect(isPublicIpAddress('192.168.1.1')).toBe(false);
    expect(isPublicIpAddress('::1')).toBe(false);
    expect(isPublicIpAddress('fd00::1')).toBe(false);
    expect(isPublicIpAddress('2001:db8::1')).toBe(false);
    expect(isPublicIpAddress('::ffff:127.0.0.1')).toBe(false);
    expect(isPublicIpAddress('::ffff:7f00:1')).toBe(false);
    expect(isPublicIpAddress('8.8.8.8')).toBe(true);
    expect(isPublicIpAddress('2606:4700:4700::1111')).toBe(true);
  });

  it('requires HTTPS and rejects any DNS answer that is private', async () => {
    const publicResolver = async () => [{ address: '8.8.8.8', family: 4 as const }];
    await expect(resolvePublicWebhookTarget('https://hooks.example.com/events', publicResolver)).resolves.toMatchObject({
      hostname: 'hooks.example.com',
    });
    await expect(resolvePublicWebhookTarget('http://hooks.example.com', publicResolver)).rejects.toThrow('HTTPS');
    await expect(resolvePublicWebhookTarget('https://localhost/test', publicResolver)).rejects.toThrow('public hostname');
    await expect(
      resolvePublicWebhookTarget('https://hooks.example.com', async () => [
        { address: '8.8.8.8', family: 4 },
        { address: '10.0.0.7', family: 4 },
      ]),
    ).rejects.toThrow('non-public');
    await expect(resolvePublicWebhookTarget('https://[::ffff:127.0.0.1]/test')).rejects.toThrow('non-public');
  });
});
