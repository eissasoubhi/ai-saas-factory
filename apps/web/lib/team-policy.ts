export type WorkspaceRole = 'owner' | 'admin' | 'member';

export function roleIncludes(role: string | readonly string[], expected: WorkspaceRole) {
  const roles =
    typeof role === 'string'
      ? role
          .split(',')
          .map((item: string) => item.trim())
          .filter(Boolean)
      : role;
  return roles.includes(expected);
}

export function normalizeWorkspaceRole(role: string): WorkspaceRole {
  if (roleIncludes(role, 'owner')) return 'owner';
  if (roleIncludes(role, 'admin')) return 'admin';
  return 'member';
}

export function wouldRemoveLastOwner(input: {
  currentRole: string | readonly string[];
  nextRole?: string | readonly string[] | null;
  ownerCount: number;
}) {
  if (!roleIncludes(input.currentRole, 'owner')) return false;
  const remainsOwner = input.nextRole ? roleIncludes(input.nextRole, 'owner') : false;
  return !remainsOwner && input.ownerCount <= 1;
}

export function canManageWorkspaceMember(input: {
  actorRole: string;
  targetRole: string;
  nextRole?: WorkspaceRole;
  ownerCount: number;
}) {
  const actor = normalizeWorkspaceRole(input.actorRole);
  const target = normalizeWorkspaceRole(input.targetRole);
  if (actor === 'member') return false;
  if (actor === 'admin' && (target === 'owner' || input.nextRole === 'owner')) return false;
  if (
    wouldRemoveLastOwner({
      currentRole: target,
      nextRole: input.nextRole ?? null,
      ownerCount: input.ownerCount,
    })
  ) {
    return false;
  }
  return true;
}
