import { describe, expect, it } from 'vitest';
import {
  decodeAuditCursor,
  encodeAuditCursor,
  normalizeAuditLimit,
  summarizeUsageMetrics,
} from './observability';

describe('audit cursor', () => {
  it('round trips an ordered timestamp/id cursor', () => {
    const cursor = { createdAt: new Date('2026-08-15T12:34:56.789Z'), id: 'audit-123' };
    expect(decodeAuditCursor(encodeAuditCursor(cursor))).toEqual(cursor);
  });

  it('rejects malformed cursors', () => {
    expect(decodeAuditCursor('not-a-real-cursor')).toBeNull();
    expect(decodeAuditCursor(Buffer.from('invalid-date\naudit-1').toString('base64url'))).toBeNull();
    expect(decodeAuditCursor(Buffer.from('2026-08-15T12:00:00.000Z\n').toString('base64url'))).toBeNull();
  });
});

describe('audit page bounds', () => {
  it('uses a bounded default', () => {
    expect(normalizeAuditLimit(undefined)).toBe(50);
  });

  it('clamps abusive page sizes', () => {
    expect(normalizeAuditLimit(0)).toBe(1);
    expect(normalizeAuditLimit(-500)).toBe(1);
    expect(normalizeAuditLimit(99999)).toBe(100);
  });
});

describe('usage aggregation policy', () => {
  it('maps immutable metric totals into the dashboard summary', () => {
    expect(
      summarizeUsageMetrics([
        { metric: 'ai.requests', value: '12' },
        { metric: 'ai.input_tokens', value: '3456' },
        { metric: 'ai.output_tokens', value: 789 },
        { metric: 'ai.embedding_tokens', value: '222' },
        { metric: 'ai.cost_micros', value: '1500000' },
      ]),
    ).toEqual({
      metrics: {
        'ai.requests': 12,
        'ai.input_tokens': 3456,
        'ai.output_tokens': 789,
        'ai.embedding_tokens': 222,
        'ai.cost_micros': 1500000,
      },
      requests: 12,
      inputTokens: 3456,
      outputTokens: 789,
      embeddingTokens: 222,
      totalCostMicros: 1500000,
    });
  });

  it('fails closed to zero for absent metrics instead of inventing usage', () => {
    expect(summarizeUsageMetrics([])).toEqual({
      metrics: {},
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      embeddingTokens: 0,
      totalCostMicros: 0,
    });
  });
});
