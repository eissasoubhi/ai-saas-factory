import { describe, expect, it } from 'vitest';
import { chunkDocumentText, documentLimits, extractDocumentText } from './index';

describe('document limits', () => {
  it('falls back when settings are invalid', () => {
    expect(documentLimits({ RAG_CHUNK_CHARS: 'oops', DOCUMENT_MAX_PDF_PAGES: '0' } as NodeJS.ProcessEnv)).toMatchObject({
      chunkChars: 3_000,
      maxPages: 200,
    });
  });
});

describe('text extraction', () => {
  it('normalizes UTF-8 text documents', async () => {
    const result = await extractDocumentText({
      contentType: 'text/plain; charset=utf-8',
      bytes: new TextEncoder().encode('First  line\r\n\r\n\r\nSecond line'),
    });

    expect(result).toEqual({ text: 'First line\n\nSecond line', pageCount: null });
  });

  it('rejects unsupported document types', async () => {
    await expect(
      extractDocumentText({ contentType: 'image/png', bytes: new Uint8Array([1, 2, 3]) }),
    ).rejects.toThrow(/does not support/);
  });
});

describe('deterministic chunking', () => {
  it('creates stable ordered chunks with bounded overlap', () => {
    const text = Array.from({ length: 20 }, (_, index) => `Paragraph ${index} contains useful searchable text.`).join('\n\n');
    const first = chunkDocumentText(text, { chunkChars: 180, overlapChars: 30 });
    const second = chunkDocumentText(text, { chunkChars: 180, overlapChars: 30 });

    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(1);
    expect(first.map((chunk) => chunk.index)).toEqual(first.map((_, index) => index));
    expect(first.every((chunk) => chunk.content.length <= 180)).toBe(true);
    for (let index = 1; index < first.length; index += 1) {
      expect(first[index]!.characterStart).toBeLessThan(first[index - 1]!.characterEnd);
    }
  });

  it('returns no chunks for empty content', () => {
    expect(chunkDocumentText('   \n\n ')).toEqual([]);
  });
});
