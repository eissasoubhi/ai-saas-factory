export type ModelPricing = {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
};

export type ModelPricingTable = Record<string, ModelPricing>;

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function parseModelPricingJson(raw: string | undefined): ModelPricingTable {
  if (!raw?.trim()) return {};

  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('AI_MODEL_PRICING_JSON must be a JSON object keyed by provider:model.');
  }

  const result: ModelPricingTable = {};
  for (const [modelId, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`Invalid pricing entry for ${modelId}.`);
    }
    const entry = value as Record<string, unknown>;
    if (
      !isNonNegativeFiniteNumber(entry.inputUsdPerMillion) ||
      !isNonNegativeFiniteNumber(entry.outputUsdPerMillion)
    ) {
      throw new Error(`Pricing for ${modelId} requires non-negative inputUsdPerMillion and outputUsdPerMillion.`);
    }
    result[modelId] = {
      inputUsdPerMillion: entry.inputUsdPerMillion,
      outputUsdPerMillion: entry.outputUsdPerMillion,
    };
  }
  return result;
}

export function estimateAiCostMicros(input: {
  modelId: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  pricing?: ModelPricingTable;
}) {
  const pricing = input.pricing ?? parseModelPricingJson(process.env.AI_MODEL_PRICING_JSON);
  const modelPricing = pricing[input.modelId];
  if (!modelPricing) return null;

  const inputTokens = Math.max(0, input.inputTokens ?? 0);
  const outputTokens = Math.max(0, input.outputTokens ?? 0);

  // USD / 1M tokens converted to micro-USD cancels the 1M denominator.
  return Math.round(
    inputTokens * modelPricing.inputUsdPerMillion +
      outputTokens * modelPricing.outputUsdPerMillion,
  );
}
