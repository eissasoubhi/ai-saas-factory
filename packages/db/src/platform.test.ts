import { describe, expect, it } from 'vitest';
import {
  decodePlatformCursor,
  encodePlatformCursor,
  endpointAcceptsEvent,
  normalizePlatformListLimit,
} from './platform';

describe('platform pagination', () => {
  it('round-trips stable createdAt/id cursors', () => {
    const cursor = { createdAt: new Date('2026-08-16T12:00:00.000Z'), id: 'delivery_123' };
    expect(decodePlatformCursor(encodePlatformCursor(cursor))).toEqual(cursor);
    expect(decodePlatformCursor('not-base64-json')).toBeNull();
  });

  it('bounds list sizes', () => {
    expect(normalizePlatformListLimit(undefined)).toBe(50);
    expect(normalizePlatformListLimit(0)).toBe(1);
    expect(normalizePlatformListLimit(500)).toBe(100);
  });
});

describe('webhook subscriptions', () => {
  it('matches exact events or wildcard subscriptions', () => {
    expect(endpointAcceptsEvent(['ai.generation.completed'], 'ai.generation.completed')).toBe(true);
    expect(endpointAcceptsEvent(['*'], 'file.ready')).toBe(true);
    expect(endpointAcceptsEvent(['file.ready'], 'file.failed')).toBe(false);
  });
});
