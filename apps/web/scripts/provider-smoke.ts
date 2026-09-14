import { randomUUID } from 'node:crypto';
import { smokePgVectorRetrieval } from '@factory/db';
import { embedQuery } from '@factory/embeddings';
import {
  createPresignedUpload,
  deleteStoredObject,
  headStoredObject,
  readStoredObjectBytes,
  storageConfig,
  validateStoredObject,
} from '@factory/storage';
import { generateText } from 'ai';
import { resolveAiModel } from '../lib/ai-models';

const AI_EXPECTED = 'AI_SAAS_FACTORY_SMOKE_OK';

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for provider smoke`);
  return value;
}

function storageEnabled() {
  return process.env.PROVIDER_SMOKE_STORAGE?.trim().toLowerCase() === 'true';
}

async function smokeAiProvider() {
  const resolved = resolveAiModel();
  const result = await generateText({
    model: resolved.model,
    prompt: `Reply with exactly ${AI_EXPECTED} and nothing else.`,
    maxOutputTokens: 32,
  });
  if (result.text.trim() !== AI_EXPECTED) {
    throw new Error(`AI provider smoke returned an unexpected fixed-fixture response for ${resolved.modelId}`);
  }
  return {
    status: 'ok' as const,
    modelId: resolved.modelId,
    finishReason: result.finishReason,
    inputTokens: result.usage.inputTokens ?? null,
    outputTokens: result.usage.outputTokens ?? null,
  };
}

async function smokeEmbeddingAndVector() {
  const embedded = await embedQuery('AI SaaS Factory synthetic provider smoke marker alpha');
  const retrieval = await smokePgVectorRetrieval(embedded.embedding);
  return {
    status: 'ok' as const,
    modelId: embedded.modelId,
    dimensions: embedded.embedding.length,
    tokens: embedded.tokens,
    similarity: Math.round(retrieval.similarity * 1_000_000) / 1_000_000,
  };
}

async function smokeStorage() {
  if (!storageEnabled()) return { status: 'skipped' as const, reason: 'PROVIDER_SMOKE_STORAGE is not true' };

  const config = storageConfig();
  const id = randomUUID();
  const key = `smoke/provider/${id}.txt`;
  const contentType = 'text/plain';
  const payload = new TextEncoder().encode(`AI SaaS Factory synthetic storage smoke ${id}`);
  let created = false;

  try {
    const upload = await createPresignedUpload({ key, contentType, config });
    const response = await fetch(upload.url, {
      method: 'PUT',
      headers: { 'content-type': contentType },
      body: payload,
    });
    if (!response.ok) throw new Error(`Storage presigned PUT failed with HTTP ${response.status}`);
    created = true;

    const metadata = await headStoredObject({ key, config });
    validateStoredObject({ expectedContentType: contentType, expectedSizeBytes: payload.byteLength, actual: metadata });
    const downloaded = await readStoredObjectBytes({ key, config });
    if (!Buffer.from(downloaded).equals(Buffer.from(payload))) {
      throw new Error('Storage smoke downloaded bytes do not match the synthetic upload');
    }

    return {
      status: 'ok' as const,
      sizeBytes: metadata.sizeBytes,
      contentType: metadata.contentType,
      eTagPresent: Boolean(metadata.eTag),
    };
  } finally {
    if (created) await deleteStoredObject({ key, config }).catch(() => undefined);
  }
}

async function main() {
  required('OPENAI_API_KEY');
  required('DATABASE_URL');
  if (storageEnabled()) storageConfig();

  const startedAt = Date.now();
  const ai = await smokeAiProvider();
  const embedding = await smokeEmbeddingAndVector();
  const storage = await smokeStorage();

  console.log(
    JSON.stringify({
      ok: true,
      durationMs: Date.now() - startedAt,
      checks: { ai, embedding, storage },
    }),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      ok: false,
      error: {
        name: error instanceof Error ? error.name : 'Error',
        message: error instanceof Error ? error.message : String(error),
      },
    }),
  );
  process.exitCode = 1;
});
