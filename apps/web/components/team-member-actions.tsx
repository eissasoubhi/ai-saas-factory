'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { authClient } from '@/lib/auth-client';
import {
  canManageWorkspaceMember,
  normalizeWorkspaceRole,
  type WorkspaceRole,
} from '@/lib/team-policy';

export function TeamMemberActions({
  organizationId,
  memberId,
  memberRole,
  actorRole,
  ownerCount,
  isSelf,
}: {
  organizationId: string;
  memberId: string;
  memberRole: string;
  actorRole: string;
  ownerCount: number;
  isSelf: boolean;
}) {
  const router = useRouter();
  const currentRole = normalizeWorkspaceRole(memberRole);
  const [selectedRole, setSelectedRole] = useState<WorkspaceRole>(currentRole);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allowedRoles = useMemo(
    () =>
      (['member', 'admin', 'owner'] as const).filter((role) =>
        canManageWorkspaceMember({
          actorRole,
          targetRole: memberRole,
          nextRole: role,
          ownerCount,
        }),
      ),
    [actorRole, memberRole, ownerCount],
  );

  if (isSelf) {
    return <span className="text-xs text-zinc-600">Current user</span>;
  }

  const canRemove = canManageWorkspaceMember({
    actorRole,
    targetRole: memberRole,
    ownerCount,
  });

  async function updateRole() {
    if (selectedRole === currentRole) return;
    setPending(true);
    setError(null);
    try {
      const result = await authClient.organization.updateMemberRole({
        organizationId,
        memberId,
        role: selectedRole,
      });
      if (result.error) throw new Error(result.error.message ?? 'Unable to update member role.');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update member role.');
    } finally {
      setPending(false);
    }
  }

  async function removeMember() {
    if (!canRemove || !window.confirm('Remove this member from the workspace?')) return;
    setPending(true);
    setError(null);
    try {
      const result = await authClient.organization.removeMember({
        organizationId,
        memberIdOrEmail: memberId,
      });
      if (result.error) throw new Error(result.error.message ?? 'Unable to remove member.');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to remove member.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex max-w-sm flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <select
          value={selectedRole}
          disabled={pending || allowedRoles.length === 0}
          onChange={(event) => setSelectedRole(event.target.value as WorkspaceRole)}
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm capitalize"
        >
          {allowedRoles.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={pending || selectedRole === currentRole}
          onClick={() => void updateRole()}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm disabled:opacity-40"
        >
          Save role
        </button>
        <button
          type="button"
          disabled={pending || !canRemove}
          onClick={() => void removeMember()}
          className="rounded-lg border border-red-900 px-3 py-1.5 text-sm text-red-300 disabled:opacity-40"
        >
          Remove
        </button>
      </div>
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
    </div>
  );
}
