import { randomUUID } from 'node:crypto';

export type TelemetryLevel = 'debug' | 'info' | 'warn' | 'error';

export type TelemetryEventInput = {
  name: string;
  level?: TelemetryLevel;
  component: string;
  correlationId?: string | null;
  durationMs?: number | null;
  organizationId?: string | null;
  userId?: string | null;
  attributes?: Record<string, unknown>;
  error?: unknown;
};

export type TelemetryEvent = {
  timestamp: string;
  level: TelemetryLevel;
  name: string;
  component: string;
  correlationId: string;
  durationMs?: number;
  organizationId?: string;
  userId?: string;
  attributes?: Record<string, unknown>;
  error?: { name: string; message: string };
};

const REDACTED = '[REDACTED]';
const MAX_STRING_LENGTH = 2_000;
const MAX_DEPTH = 6;
const SAFE_CORRELATION_ID = /^[A-Za-z0-9._:/-]{1,128}$/;

const SECRET_KEYS = new Set([
  'authorization',
  'cookie',
  'setcookie',
  'password',
  'secret',
  'clientsecret',
  'apikey',
  'accesskeyid',
  'secretaccesskey',
  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'webhooksecret',
  'sessiontoken',
  'stripewebhooksecret',
  'stripekey',
  'openaikey',
]);

const CONTENT_KEYS = new Set([
  'prompt',
  'prompts',
  'message',
  'messages',
  'content',
  'document',
  'documenttext',
  'body',
  'requestbody',
  'responsebody',
  'signedurl',
]);

function normalizedKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function shouldRedactKey(key: string) {
  const normalized = normalizedKey(key);
  return SECRET_KEYS.has(normalized) || CONTENT_KEYS.has(normalized);
}

function looksLikeSignedUrl(value: string) {
  const lower = value.toLowerCase();
  return (
    lower.includes('x-amz-signature=') ||
    lower.includes('x-amz-credential=') ||
    lower.includes('x-goog-signature=') ||
    lower.includes('signature=') && lower.includes('expires=')
  );
}

function sanitizeString(value: string) {
  if (looksLikeSignedUrl(value)) return REDACTED;
  return value.length <= MAX_STRING_LENGTH ? value : `${value.slice(0, MAX_STRING_LENGTH)}…`;
}

export function sanitizeTelemetryValue(value: unknown, depth = 0): unknown {
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return sanitizeString(value);
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return { name: value.name, message: sanitizeString(value.message) };
  if (depth >= MAX_DEPTH) return '[TRUNCATED]';
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitizeTelemetryValue(item, depth + 1));
  if (typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = shouldRedactKey(key) ? REDACTED : sanitizeTelemetryValue(item, depth + 1);
    }
    return output;
  }
  return sanitizeString(String(value));
}

export function sanitizeTelemetryAttributes(attributes: Record<string, unknown> | undefined) {
  if (!attributes) return undefined;
  return sanitizeTelemetryValue(attributes) as Record<string, unknown>;
}

export function correlationIdFromHeaders(headers?: Headers | null) {
  const candidate = headers?.get('x-request-id')?.trim();
  return candidate && SAFE_CORRELATION_ID.test(candidate) ? candidate : randomUUID();
}

export function createTelemetryEvent(input: TelemetryEventInput): TelemetryEvent {
  const event: TelemetryEvent = {
    timestamp: new Date().toISOString(),
    level: input.level ?? 'info',
    name: input.name,
    component: input.component,
    correlationId:
      input.correlationId && SAFE_CORRELATION_ID.test(input.correlationId)
        ? input.correlationId
        : randomUUID(),
  };

  if (input.durationMs != null && Number.isFinite(input.durationMs) && input.durationMs >= 0) {
    event.durationMs = Math.round(input.durationMs);
  }
  if (input.organizationId) event.organizationId = input.organizationId;
  if (input.userId) event.userId = input.userId;
  const attributes = sanitizeTelemetryAttributes(input.attributes);
  if (attributes && Object.keys(attributes).length > 0) event.attributes = attributes;
  if (input.error) {
    const sanitized = sanitizeTelemetryValue(input.error);
    if (sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized)) {
      const error = sanitized as { name?: unknown; message?: unknown };
      event.error = {
        name: typeof error.name === 'string' ? error.name : 'Error',
        message: typeof error.message === 'string' ? error.message : 'Unknown error',
      };
    } else {
      event.error = { name: 'Error', message: sanitizeString(String(input.error)) };
    }
  }
  return event;
}

export function emitTelemetry(input: TelemetryEventInput) {
  const event = createTelemetryEvent(input);
  const line = JSON.stringify(event);
  if (event.level === 'error') console.error(line);
  else if (event.level === 'warn') console.warn(line);
  else console.log(line);
  return event;
}
