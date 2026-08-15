import { openai } from '@ai-sdk/openai';
import { embedMany } from 'ai';

export const RAG_EMBEDDING_DIMENSIONS = 1536;

export type EmbeddingRuntimeConfig = {
  modelId: `openai:${string}`;
  dimensions: typeof RAG_EMBEDDING_DIMENSIONS;
  maxParallelCalls: number;
};

function integerSetting(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

export function embeddingRuntimeConfig(env: NodeJS.ProcessEnv = process.env): EmbeddingRuntimeConfig {
  const rawModelId = env.AI_EMBEDDING_MODEL_ID?.trim() || 'openai:text-embedding-3-small';
  const modelId = rawModelId.includes(':') ? rawModelId : `openai:${rawModelId}`;
  if (!modelId.startsWith('openai:') || modelId.length <= 'openai:'.length) {
    throw new Error(`Unsupported embedding model ID ${modelId}; this starter currently registers the OpenAI embedding provider`);
  }

  const configuredDimensions = integerSetting(
    env.AI_EMBEDDING_DIMENSIONS,
    RAG_EMBEDDING_DIMENSIONS,
    1,
    16_384,
  );
  if (configuredDimensions !== RAG_EMBEDDING_DIMENSIONS) {
    throw new Error(
      `AI_EMBEDDING_DIMENSIONS must be ${RAG_EMBEDDING_DIMENSIONS} because the document_chunk.embedding column is fixed to that dimension`,
    );
  }

  return {
    modelId: modelId as `openai:${string}`,
    dimensions: RAG_EMBEDDING_DIMENSIONS,
    maxParallelCalls: integerSetting(env.AI_EMBEDDING_MAX_PARALLEL_CALLS, 2, 1, 20),
  };
}

function modelFromConfig(config: EmbeddingRuntimeConfig) {
  const modelName = config.modelId.slice('openai:'.length);
  return openai.embeddingModel(modelName);
}

export async function embedTexts(
  values: string[],
  options: { env?: NodeJS.ProcessEnv; abortSignal?: AbortSignal } = {},
) {
  if (values.length === 0) return { embeddings: [] as number[][], tokens: 0, modelId: embeddingRuntimeConfig(options.env).modelId };
  const env = options.env ?? process.env;
  if (!env.OPENAI_API_KEY?.trim()) throw new Error('OPENAI_API_KEY is required for embeddings');
  const config = embeddingRuntimeConfig(env);
  const result = await embedMany({
    model: modelFromConfig(config),
    values: values.map((value) => value.replaceAll('\0', '').trim()),
    maxParallelCalls: config.maxParallelCalls,
    ...(options.abortSignal ? { abortSignal: options.abortSignal } : {}),
  });

  for (const embedding of result.embeddings) {
    if (embedding.length !== config.dimensions) {
      throw new Error(
        `Embedding model ${config.modelId} returned ${embedding.length} dimensions; expected ${config.dimensions}`,
      );
    }
  }

  return {
    embeddings: result.embeddings,
    tokens: result.usage.tokens ?? 0,
    modelId: config.modelId,
  };
}

export async function embedQuery(value: string, options: { env?: NodeJS.ProcessEnv } = {}) {
  const result = await embedTexts([value], options);
  const embedding = result.embeddings[0];
  if (!embedding) throw new Error('Embedding provider returned no vector for the query');
  return { embedding, tokens: result.tokens, modelId: result.modelId };
}
