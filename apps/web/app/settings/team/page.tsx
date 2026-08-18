import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { InviteMemberForm } from '@/components/invite-member-form';
import { TeamMemberActions } from '@/components/team-member-actions';
import { auth } from '@/lib/auth';
import { roleIncludes } from '@/lib/team-policy';

export default async function TeamSettingsPage() {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) redirect('/sign-in');
  if (!session.session.activeOrganizationId) redirect('/dashboard');

  const [organization, activeRole] = await Promise.all([
    auth.api.getFullOrganization({
      query: { organizationId: session.session.activeOrganizationId },
      headers: requestHeaders,
    }),
    auth.api.getActiveMemberRole({ headers: requestHeaders }),
  ]);
  if (!organization) redirect('/dashboard');

  const canManage = activeRole.role === 'owner' || activeRole.role === 'admin';
  const ownerCount = organization.members.filter((member) => roleIncludes(member.role, 'owner')).length;

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-16">
      <h1 className="text-4xl font-bold">Team</h1>
      <p className="mt-3 text-zinc-400">Invite members and manage workspace access.</p>
      {canManage ? (
        <InviteMemberForm organizationId={organization.id} />
      ) : (
        <p className="mt-6 rounded-lg border border-zinc-800 p-4 text-sm text-zinc-400">
          Only owners and admins can invite or manage teammates.
        </p>
      )}
      <div className="mt-10 divide-y divide-zinc-800 rounded-2xl border border-zinc-800">
        {organization.members.map((member) => (
          <div key={member.id} className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-medium">{member.user.name}</p>
              <p className="text-sm text-zinc-500">{member.user.email}</p>
              <p className="mt-1 text-xs capitalize text-zinc-600">{member.role}</p>
            </div>
            {canManage ? (
              <TeamMemberActions
                organizationId={organization.id}
                memberId={member.id}
                memberRole={member.role}
                actorRole={activeRole.role}
                ownerCount={ownerCount}
                isSelf={member.userId === session.user.id}
              />
            ) : null}
          </div>
        ))}
      </div>
    </main>
  );
}
