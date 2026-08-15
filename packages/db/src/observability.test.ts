import { describe, expect, it } from 'vitest';
import { decodeAuditCursor, encodeAuditCursor, normalizeAuditLimit } from './observability';

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
