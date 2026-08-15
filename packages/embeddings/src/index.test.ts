import { describe, expect, it } from 'vitest';
import { embeddingRuntimeConfig, RAG_EMBEDDING_DIMENSIONS } from './index';

describe('embedding runtime configuration', () => {
  it('uses the 1536-dimensional OpenAI default', () => {
    expect(embeddingRuntimeConfig({} as NodeJS.ProcessEnv)).toEqual({
      modelId: 'openai:text-embedding-3-small',
      dimensions: RAG_EMBEDDING_DIMENSIONS,
      maxParallelCalls: 2,
    });
  });

  it('normalizes a legacy OpenAI model name', () => {
    expect(
      embeddingRuntimeConfig({ AI_EMBEDDING_MODEL_ID: 'text-embedding-3-small' } as NodeJS.ProcessEnv).modelId,
    ).toBe('openai:text-embedding-3-small');
  });

  it('rejects providers that are not registered', () => {
    expect(() =>
      embeddingRuntimeConfig({ AI_EMBEDDING_MODEL_ID: 'other:embed-model' } as NodeJS.ProcessEnv),
    ).toThrow(/Unsupported embedding model/);
  });

  it('rejects a dimension incompatible with the database vector column', () => {
    expect(() =>
      embeddingRuntimeConfig({ AI_EMBEDDING_DIMENSIONS: '512' } as NodeJS.ProcessEnv),
    ).toThrow(/must be 1536/);
  });
});
