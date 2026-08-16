import { lookup as dnsLookup } from 'node:dns/promises';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';

export const API_KEY_SCOPES = [
  'ai:read',
  'ai:write',
  'files:read',
  'files:write',
  'webhooks:read',
  'webhooks:write',
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export type GeneratedApiKey = {
  id: string;
  token: string;
  prefix: string;
  hash: string;
};

const API_KEY_PATTERN = /^asf_sk_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_([A-Za-z0-9_-]{43})$/i;

export function hashApiKey(token: string) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function generateApiKey(): GeneratedApiKey {
  const id = randomUUID();
  const secret = randomBytes(32).toString('base64url');
  const token = `asf_sk_${id}_${secret}`;
  return {
    id,
    token,
    prefix: `asf_sk_${id.slice(0, 8)}`,
    hash: hashApiKey(token),
  };
}

export function parseApiKey(token: string) {
  const normalized = token.trim();
  const match = API_KEY_PATTERN.exec(normalized);
  if (!match?.[1]) return null;
  return { id: match[1].toLowerCase(), token: normalized };
}

export function verifyApiKeyHash(token: string, expectedHash: string) {
  const actual = Buffer.from(hashApiKey(token), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function normalizeApiKeyScopes(scopes: readonly string[]): ApiKeyScope[] {
  const allowed = new Set<string>(API_KEY_SCOPES);
  return [...new Set(scopes.filter((scope): scope is ApiKeyScope => allowed.has(scope)))];
}

export function apiKeyHasScope(grantedScopes: readonly string[], requiredScope: ApiKeyScope) {
  return grantedScopes.includes(requiredScope);
}

export function generateWebhookSecret() {
  return `whsec_${randomBytes(32).toString('base64url')}`;
}

export type EncryptedSecret = {
  version: 1;
  ciphertext: string;
  iv: string;
  tag: string;
};

export function decodeEncryptionKey(value: string) {
  const normalized = value.trim();
  const buffer = /^[0-9a-f]{64}$/i.test(normalized)
    ? Buffer.from(normalized, 'hex')
    : Buffer.from(normalized, 'base64url');
  if (buffer.length !== 32) {
    throw new Error('PLATFORM_SECRET_ENCRYPTION_KEY must decode to exactly 32 bytes');
  }
  return buffer;
}

export function platformEncryptionKey(value = process.env.PLATFORM_SECRET_ENCRYPTION_KEY) {
  if (!value?.trim()) throw new Error('PLATFORM_SECRET_ENCRYPTION_KEY is required');
  return decodeEncryptionKey(value);
}

export function encryptSecret(secret: string, key: Uint8Array): EncryptedSecret {
  if (key.byteLength !== 32) throw new Error('Secret encryption key must be 32 bytes');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return {
    version: 1,
    ciphertext: ciphertext.toString('base64url'),
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
  };
}

export function decryptSecret(encrypted: EncryptedSecret, key: Uint8Array) {
  if (encrypted.version !== 1) throw new Error('Unsupported encrypted secret version');
  if (key.byteLength !== 32) throw new Error('Secret encryption key must be 32 bytes');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(encrypted.iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(encrypted.tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export type WebhookSignatureInput = {
  timestamp: number;
  eventId: string;
  body: string;
};

function webhookSigningPayload(input: WebhookSignatureInput) {
  return `${input.timestamp}.${input.eventId}.${input.body}`;
}

export function signWebhookPayload(secret: string, input: WebhookSignatureInput) {
  return `v1=${createHmac('sha256', secret).update(webhookSigningPayload(input), 'utf8').digest('hex')}`;
}

export function verifyWebhookSignature(secret: string, input: WebhookSignatureInput, signature: string) {
  if (!signature.startsWith('v1=')) return false;
  const expected = Buffer.from(signWebhookPayload(secret, input).slice(3), 'hex');
  const actual = Buffer.from(signature.slice(3), 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export type ResolvedAddress = {
  address: string;
  family: 4 | 6;
};

export type WebhookResolver = (hostname: string) => Promise<readonly ResolvedAddress[]>;

function normalizeHostname(hostname: string) {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
}

function isPrivateIpv4(address: string) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a = 0, b = 0] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && parts[2] === 2) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && parts[2] === 100) ||
    (a === 203 && b === 0 && parts[2] === 113) ||
    a >= 224
  );
}

function isPrivateIpv6(address: string) {
  const normalized = address.toLowerCase();
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (/^fe[89ab]/.test(normalized)) return true;
  if (normalized.startsWith('ff')) return true;
  if (normalized.startsWith('2001:db8:') || normalized === '2001:db8::') return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized)?.[1];
  return mapped ? isPrivateIpv4(mapped) : false;
}

export function isPublicIpAddress(address: string) {
  const family = isIP(address);
  if (family === 4) return !isPrivateIpv4(address);
  if (family === 6) return !isPrivateIpv6(address);
  return false;
}

async function defaultWebhookResolver(hostname: string): Promise<readonly ResolvedAddress[]> {
  const rows = await dnsLookup(hostname, { all: true, verbatim: true });
  return rows.flatMap((row) =>
    row.family === 4 || row.family === 6 ? [{ address: row.address, family: row.family }] : [],
  );
}

export async function resolvePublicWebhookTarget(
  value: string,
  resolver: WebhookResolver = defaultWebhookResolver,
) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Webhook URL is invalid');
  }
  if (url.protocol !== 'https:') throw new Error('Webhook URL must use HTTPS');
  if (url.username || url.password) throw new Error('Webhook URL must not include credentials');
  if (url.hash) throw new Error('Webhook URL must not include a fragment');

  const hostname = normalizeHostname(url.hostname.toLowerCase());
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new Error('Webhook URL must use a public hostname');
  }

  const literalFamily = isIP(hostname);
  const addresses: readonly ResolvedAddress[] = literalFamily
    ? [{ address: hostname, family: literalFamily as 4 | 6 }]
    : await resolver(hostname);
  if (addresses.length === 0) throw new Error('Webhook hostname did not resolve');
  if (addresses.some((entry) => !isPublicIpAddress(entry.address))) {
    throw new Error('Webhook hostname resolves to a non-public address');
  }

  return { url, hostname, addresses };
}

export type WebhookHttpResult = {
  status: number;
  bodyPreview: string;
};

export async function postSignedWebhook(input: {
  url: string;
  eventId: string;
  eventType: string;
  body: string;
  secret: string;
  timeoutMs?: number;
  resolver?: WebhookResolver;
}): Promise<WebhookHttpResult> {
  const bodyBytes = Buffer.byteLength(input.body, 'utf8');
  if (bodyBytes > 256 * 1024) throw new Error('Webhook payload exceeds 256 KiB');

  const target = await resolvePublicWebhookTarget(input.url, input.resolver);
  const pinned = target.addresses[0];
  if (!pinned) throw new Error('Webhook hostname did not resolve');
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signWebhookPayload(input.secret, { timestamp, eventId: input.eventId, body: input.body });

  return await new Promise<WebhookHttpResult>((resolve, reject) => {
    const request = httpsRequest(
      {
        protocol: 'https:',
        hostname: target.hostname,
        port: target.url.port || 443,
        path: `${target.url.pathname}${target.url.search}`,
        method: 'POST',
        servername: target.hostname,
        lookup: (_hostname, _options, callback) => callback(null, pinned.address, pinned.family),
        headers: {
          'content-type': 'application/json',
          'content-length': String(bodyBytes),
          'user-agent': 'AI-SaaS-Factory-Webhooks/1.0',
          'x-ai-saas-event-id': input.eventId,
          'x-ai-saas-event-type': input.eventType,
          'x-ai-saas-timestamp': String(timestamp),
          'x-ai-saas-signature': signature,
        },
      },
      (response) => {
        let preview = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          if (preview.length < 4096) preview += chunk.slice(0, 4096 - preview.length);
        });
        response.on('end', () => {
          resolve({ status: response.statusCode ?? 0, bodyPreview: preview });
        });
      },
    );
    request.setTimeout(input.timeoutMs ?? 10_000, () => request.destroy(new Error('Webhook request timed out')));
    request.on('error', reject);
    request.end(input.body);
  });
}
