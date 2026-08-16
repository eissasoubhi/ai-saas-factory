export const OUTBOUND_WEBHOOK_EVENT_TYPES = [
  'webhook.test',
  'ai.generation.completed',
  'file.ready',
  'file.failed',
  'billing.subscription.updated',
] as const;

export type OutboundWebhookEventType = (typeof OUTBOUND_WEBHOOK_EVENT_TYPES)[number];
