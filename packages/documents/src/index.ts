import { extractText, getDocumentProxy } from 'unpdf';

export type ExtractedDocument = {
  text: string;
  pageCount: number | null;
};

export type DocumentChunk = {
  index: number;
  content: string;
  characterStart: number;
  characterEnd: number;
  tokenEstimate: number;
};

const TEXT_CONTENT_TYPES = new Set([
  'application/json',
  'text/csv',
  'text/markdown',
  'text/plain',
]);

function integerSetting(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

export function documentLimits(env: NodeJS.ProcessEnv = process.env) {
  return {
    maxPages: integerSetting(env.DOCUMENT_MAX_PDF_PAGES, 200, 1, 2_000),
    maxExtractedChars: integerSetting(env.DOCUMENT_MAX_EXTRACTED_CHARS, 2_000_000, 1_000, 20_000_000),
    extractionTimeoutMs: integerSetting(env.DOCUMENT_EXTRACTION_TIMEOUT_MS, 30_000, 1_000, 300_000),
    chunkChars: integerSetting(env.RAG_CHUNK_CHARS, 3_000, 500, 12_000),
    chunkOverlapChars: integerSetting(env.RAG_CHUNK_OVERLAP_CHARS, 300, 0, 3_000),
  };
}

function normalizeText(value: string) {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/\0/g, '')
    .replace(/[\t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function assertExtractedSize(text: string, maxExtractedChars: number) {
  if (text.length > maxExtractedChars) {
    throw new Error(`Extracted document exceeds the ${maxExtractedChars}-character processing limit`);
  }
  return text;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`Document extraction exceeded ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function destroyPdfProxy(proxy: unknown) {
  const destroy = (proxy as { destroy?: () => Promise<unknown> }).destroy;
  if (typeof destroy === 'function') await destroy.call(proxy).catch(() => undefined);
}

export async function extractDocumentText(input: {
  contentType: string;
  bytes: Uint8Array;
  env?: NodeJS.ProcessEnv;
}): Promise<ExtractedDocument> {
  const contentType = input.contentType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  const limits = documentLimits(input.env);

  if (TEXT_CONTENT_TYPES.has(contentType)) {
    const text = assertExtractedSize(
      normalizeText(new TextDecoder('utf-8', { fatal: false }).decode(input.bytes)),
      limits.maxExtractedChars,
    );
    if (!text) throw new Error('Document contains no extractable text');
    return { text, pageCount: null };
  }

  if (contentType === 'application/pdf') {
    const pdf = await withTimeout(getDocumentProxy(input.bytes), limits.extractionTimeoutMs);
    if (pdf.numPages > limits.maxPages) {
      await destroyPdfProxy(pdf);
      throw new Error(`PDF has ${pdf.numPages} pages; the configured limit is ${limits.maxPages}`);
    }

    try {
      const result = await withTimeout(extractText(pdf, { mergePages: true }), limits.extractionTimeoutMs);
      const text = assertExtractedSize(normalizeText(result.text), limits.maxExtractedChars);
      if (!text) throw new Error('PDF contains no extractable text');
      return { text, pageCount: result.totalPages };
    } finally {
      await destroyPdfProxy(pdf);
    }
  }

  throw new Error(`Document extraction does not support content type ${contentType || '(missing)'}`);
}

function chooseChunkEnd(text: string, start: number, maxEnd: number) {
  if (maxEnd >= text.length) return text.length;
  const minimumBreak = start + Math.floor((maxEnd - start) * 0.6);
  const paragraphBreak = text.lastIndexOf('\n\n', maxEnd);
  if (paragraphBreak >= minimumBreak) return paragraphBreak + 2;
  const lineBreak = text.lastIndexOf('\n', maxEnd);
  if (lineBreak >= minimumBreak) return lineBreak + 1;
  const wordBreak = text.lastIndexOf(' ', maxEnd);
  if (wordBreak >= minimumBreak) return wordBreak + 1;
  return maxEnd;
}

export function chunkDocumentText(
  input: string,
  options: { chunkChars?: number; overlapChars?: number } = {},
): DocumentChunk[] {
  const text = normalizeText(input);
  if (!text) return [];

  const chunkChars = Math.max(100, Math.floor(options.chunkChars ?? 3_000));
  const overlapChars = Math.min(Math.max(0, Math.floor(options.overlapChars ?? 300)), chunkChars - 1);
  const chunks: DocumentChunk[] = [];
  let start = 0;

  while (start < text.length) {
    const maxEnd = Math.min(start + chunkChars, text.length);
    const end = chooseChunkEnd(text, start, maxEnd);
    const content = text.slice(start, end).trim();
    if (content) {
      chunks.push({
        index: chunks.length,
        content,
        characterStart: start,
        characterEnd: end,
        tokenEstimate: Math.max(1, Math.ceil(content.length / 4)),
      });
    }
    if (end >= text.length) break;
    start = Math.max(start + 1, end - overlapChars);
  }

  return chunks;
}
