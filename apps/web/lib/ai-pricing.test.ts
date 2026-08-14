import { describe, expect, it } from 'vitest';
import { estimateAiCostMicros, parseModelPricingJson } from './ai-pricing';

describe('AI model pricing', () => {
  it('parses provider:model pricing entries', () => {
    expect(
      parseModelPricingJson(
        JSON.stringify({
          'openai:test-model': { inputUsdPerMillion: 1.25, outputUsdPerMillion: 10 },
        }),
      ),
    ).toEqual({
      'openai:test-model': { inputUsdPerMillion: 1.25, outputUsdPerMillion: 10 },
    });
  });

  it('calculates micro-USD from provider-reported token counts', () => {
    expect(
      estimateAiCostMicros({
        modelId: 'openai:test-model',
        inputTokens: 1_000,
        outputTokens: 200,
        pricing: {
          'openai:test-model': { inputUsdPerMillion: 2, outputUsdPerMillion: 8 },
        },
      }),
    ).toBe(3_600);
  });

  it('returns null when pricing is intentionally not configured', () => {
    expect(
      estimateAiCostMicros({
        modelId: 'openai:unknown',
        inputTokens: 1_000,
        outputTokens: 100,
        pricing: {},
      }),
    ).toBeNull();
  });

  it('rejects invalid negative pricing', () => {
    expect(() =>
      parseModelPricingJson(
        JSON.stringify({
          'openai:test-model': { inputUsdPerMillion: -1, outputUsdPerMillion: 1 },
        }),
      ),
    ).toThrow(/requires non-negative/);
  });
});
