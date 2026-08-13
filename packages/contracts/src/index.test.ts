import { describe, expect, it } from 'vitest';
import { planIdSchema } from './index';

describe('planIdSchema', () => {
  it('rejects unknown plans', () => {
    expect(planIdSchema.safeParse('enterprise-ish').success).toBe(false);
  });
});
