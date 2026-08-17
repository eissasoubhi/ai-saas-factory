import { API_KEY_SCOPES } from '@factory/platform-security/constants';
import { z } from 'zod';
import { OUTBOUND_WEBHOOK_EVENT_TYPES } from './outbound-event-types';

const WEBHOOK_EVENT_OPTIONS = ['*', ...OUTBOUND_WEBHOOK_EVENT_TYPES] as const;

export const ApiKeyCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  scopes: z.array(z.enum(API_KEY_SCOPES)).min(1).max(API_KEY_SCOPES.length),
  expiresInDays: z.number().int().min(1).max(3650).nullable().optional(),
});

export const WebhookEndpointCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  url: z.string().trim().url().max(2_000),
  eventTypes: z.array(z.enum(WEBHOOK_EVENT_OPTIONS)).min(1).max(WEBHOOK_EVENT_OPTIONS.length),
});

export const WebhookEndpointUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  url: z.string().trim().url().max(2_000).optional(),
  eventTypes: z.array(z.enum(WEBHOOK_EVENT_OPTIONS)).min(1).max(WEBHOOK_EVENT_OPTIONS.length).optional(),
  status: z.enum(['active', 'disabled']).optional(),
});

export function expirationFromDays(days: number | null | undefined, now = new Date()) {
  if (days == null) return null;
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}
