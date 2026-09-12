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

export const mobileUsageSummarySchema = z.object({
  monthStart: z.string().datetime(),
  plan: planIdSchema,
  requests: z.number().int().nonnegative(),
  requestLimit: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  embeddingTokens: z.number().int().nonnegative(),
  estimatedCostMicros: z.number().int().nonnegative(),
  creditBalanceMicros: z.number().int(),
  includedCreditMicros: z.number().int().nonnegative(),
  overageAllowed: z.boolean(),
});
export type MobileUsageSummary = z.infer<typeof mobileUsageSummarySchema>;

export const mobileOverviewResponseSchema = z.object({
  organization: organizationSummarySchema,
  usage: mobileUsageSummarySchema,
});
export type MobileOverviewResponse = z.infer<typeof mobileOverviewResponseSchema>;

export const mobileStoredFileStatusSchema = z.enum([
  'uploading',
  'uploaded',
  'processing',
  'ready',
  'failed',
]);

export const mobileStoredFileSchema = z.object({
  id: z.string(),
  originalName: z.string(),
  contentType: z.string(),
  status: mobileStoredFileStatusSchema,
  sizeBytes: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  processedAt: z.string().datetime().nullable(),
});
export type MobileStoredFile = z.infer<typeof mobileStoredFileSchema>;

export const mobileFilesResponseSchema = z.object({
  items: z.array(mobileStoredFileSchema),
});
export type MobileFilesResponse = z.infer<typeof mobileFilesResponseSchema>;
