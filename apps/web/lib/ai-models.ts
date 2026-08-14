import { openai } from '@ai-sdk/openai';
import { createProviderRegistry } from 'ai';

const registry = createProviderRegistry({ openai });

export function defaultAiModelId() {
  const configured = process.env.AI_DEFAULT_MODEL_ID?.trim();
  if (configured) return configured.includes(':') ? configured : `openai:${configured}`;

  const legacyOpenAiModel = process.env.OPENAI_MODEL?.trim();
  if (legacyOpenAiModel) return `openai:${legacyOpenAiModel}`;

  return 'openai:gpt-5-mini';
}

export function allowedAiModelIds() {
  const configured = process.env.AI_ALLOWED_MODEL_IDS;
  if (!configured) return [defaultAiModelId()];

  const ids = configured
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return ids.length > 0 ? [...new Set(ids)] : [defaultAiModelId()];
}

export function defaultAllowedAiModelId() {
  const allowed = allowedAiModelIds();
  const preferred = defaultAiModelId();
  return allowed.includes(preferred) ? preferred : allowed[0] ?? preferred;
}

export function resolveAiModel(requestedModelId?: string | null) {
  const modelId = requestedModelId?.trim() || defaultAllowedAiModelId();
  if (!allowedAiModelIds().includes(modelId)) {
    throw new Error(`AI model ${modelId} is not allowed for this deployment.`);
  }

  const separatorIndex = modelId.indexOf(':');
  if (separatorIndex <= 0) throw new Error(`AI model ID must use provider:model format: ${modelId}`);
  const provider = modelId.slice(0, separatorIndex);
  if (provider !== 'openai') {
    throw new Error(`AI provider ${provider} is not installed in this edition yet.`);
  }

  const openAiModelId = modelId as `openai:${string}`;
  return {
    modelId,
    provider,
    model: registry.languageModel(openAiModelId),
  };
}
