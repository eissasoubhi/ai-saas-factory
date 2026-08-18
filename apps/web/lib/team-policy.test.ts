import { describe, expect, it } from 'vitest';
import { canManageWorkspaceMember, normalizeWorkspaceRole, wouldRemoveLastOwner } from './team-policy';

describe('workspace member policy', () => {
  it('normalizes Better Auth comma-separated roles', () => {
    expect(normalizeWorkspaceRole('member,admin')).toBe('admin');
    expect(normalizeWorkspaceRole('member')).toBe('member');
  });

  it('prevents removing or demoting the last owner', () => {
    expect(wouldRemoveLastOwner({ currentRole: 'owner', nextRole: 'admin', ownerCount: 1 })).toBe(true);
    expect(wouldRemoveLastOwner({ currentRole: 'owner', nextRole: null, ownerCount: 1 })).toBe(true);
    expect(wouldRemoveLastOwner({ currentRole: 'owner', nextRole: 'admin', ownerCount: 2 })).toBe(false);
  });

  it('keeps owner mutations owner-only', () => {
    expect(
      canManageWorkspaceMember({ actorRole: 'admin', targetRole: 'owner', ownerCount: 2 }),
    ).toBe(false);
    expect(
      canManageWorkspaceMember({
        actorRole: 'admin',
        targetRole: 'member',
        nextRole: 'owner',
        ownerCount: 1,
      }),
    ).toBe(false);
    expect(
      canManageWorkspaceMember({
        actorRole: 'owner',
        targetRole: 'member',
        nextRole: 'admin',
        ownerCount: 1,
      }),
    ).toBe(true);
  });
});
