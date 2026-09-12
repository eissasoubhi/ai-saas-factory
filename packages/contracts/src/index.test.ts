import { describe, expect, it } from 'vitest';
import {
  mobileFilesResponseSchema,
  mobileOverviewResponseSchema,
  planIdSchema,
} from './index';

describe('planIdSchema', () => {
  it('rejects unknown plans', () => {
    expect(planIdSchema.safeParse('enterprise-ish').success).toBe(false);
  });
});

describe('mobile product contracts', () => {
  it('accepts a bounded workspace usage summary', () => {
    const parsed = mobileOverviewResponseSchema.parse({
      organization: { id: 'org-a', name: 'Workspace A', slug: 'workspace-a', role: 'member' },
      usage: {
        monthStart: '2026-09-01T00:00:00.000Z',
        plan: 'pro',
        requests: 12,
        requestLimit: 25_000,
        inputTokens: 1_000,
        outputTokens: 250,
        embeddingTokens: 100,
        estimatedCostMicros: 42_000,
        creditBalanceMicros: -10_000,
        includedCreditMicros: 50_000_000,
        overageAllowed: true,
      },
    });
    expect(parsed.organization.role).toBe('member');
    expect(parsed.usage.creditBalanceMicros).toBe(-10_000);
  });

  it('rejects internal/deleted file states from the mobile list contract', () => {
    const base = {
      id: 'file-a',
      originalName: 'guide.pdf',
      contentType: 'application/pdf',
      sizeBytes: 123,
      createdAt: '2026-09-01T00:00:00.000Z',
      processedAt: null,
    };
    expect(mobileFilesResponseSchema.safeParse({ items: [{ ...base, status: 'ready' }] }).success).toBe(true);
    expect(mobileFilesResponseSchema.safeParse({ items: [{ ...base, status: 'deleted' }] }).success).toBe(false);
  });
});
