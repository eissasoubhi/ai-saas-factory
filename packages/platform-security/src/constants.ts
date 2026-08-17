export const API_KEY_SCOPES = [
  'ai:read',
  'ai:write',
  'files:read',
  'files:write',
  'webhooks:read',
  'webhooks:write',
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];
