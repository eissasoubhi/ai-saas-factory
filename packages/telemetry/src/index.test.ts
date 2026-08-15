import { describe, expect, it } from 'vitest';
import {
  correlationIdFromHeaders,
  createTelemetryEvent,
  sanitizeTelemetryAttributes,
} from './index';

describe('telemetry redaction', () => {
  it('redacts secrets and user/document content recursively', () => {
    expect(
      sanitizeTelemetryAttributes({
        authorization: 'Bearer secret-token',
        nested: {
          cookie: 'session=secret',
          apiKey: 'sk-secret',
          prompt: 'private user question',
          content: 'private document text',
          safeMetric: 42,
        },
      }),
    ).toEqual({
      authorization: '[REDACTED]',
      nested: {
        cookie: '[REDACTED]',
        apiKey: '[REDACTED]',
        prompt: '[REDACTED]',
        content: '[REDACTED]',
        safeMetric: 42,
      },
    });
  });

  it('redacts signed URLs even under an otherwise safe key', () => {
    const sanitized = sanitizeTelemetryAttributes({
      location: 'https://bucket.example/file?X-Amz-Credential=x&X-Amz-Signature=secret',
    });
    expect(sanitized).toEqual({ location: '[REDACTED]' });
  });

  it('keeps operational identifiers and token estimates', () => {
    expect(
      sanitizeTelemetryAttributes({
        organizationId: 'org-a',
        fileId: 'file-a',
        tokenEstimate: 123,
        modelId: 'openai:gpt-5-mini',
      }),
    ).toEqual({
      organizationId: 'org-a',
      fileId: 'file-a',
      tokenEstimate: 123,
      modelId: 'openai:gpt-5-mini',
    });
  });
});

describe('correlation IDs', () => {
  it('accepts a bounded safe x-request-id', () => {
    expect(correlationIdFromHeaders(new Headers({ 'x-request-id': 'req_123/worker-1' }))).toBe(
      'req_123/worker-1',
    );
  });

  it('replaces unsafe correlation values', () => {
    const id = correlationIdFromHeaders(new Headers({ 'x-request-id': 'bad value with spaces' }));
    expect(id).not.toBe('bad value with spaces');
    expect(id.length).toBeGreaterThan(10);
  });
});

describe('structured event creation', () => {
  it('serializes errors without stack traces or private attributes', () => {
    const event = createTelemetryEvent({
      name: 'worker.file_ingest.failed',
      component: 'worker',
      correlationId: 'job-123',
      durationMs: 12.8,
      attributes: { fileId: 'file-a', signedUrl: 'secret-url' },
      error: new Error('provider timeout'),
    });

    expect(event).toMatchObject({
      name: 'worker.file_ingest.failed',
      component: 'worker',
      correlationId: 'job-123',
      durationMs: 13,
      attributes: { fileId: 'file-a', signedUrl: '[REDACTED]' },
      error: { name: 'Error', message: 'provider timeout' },
    });
    expect(JSON.stringify(event)).not.toContain('stack');
  });
});
