import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.string(),
  version: z.string(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const organizationSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  role: z.enum(['owner', 'admin', 'member']),
});
export type OrganizationSummary = z.infer<typeof organizationSummarySchema>;

export const usageMetricSchema = z.enum([
  'ai.input_tokens',
  'ai.output_tokens',
  'ai.requests',
  'storage.bytes',
]);
export type UsageMetric = z.infer<typeof usageMetricSchema>;

export const planIdSchema = z.enum(['free', 'starter', 'pro']);
export type PlanId = z.infer<typeof planIdSchema>;
