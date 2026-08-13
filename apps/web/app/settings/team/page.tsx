import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { InviteMemberForm } from '@/components/invite-member-form';
import { auth } from '@/lib/auth';

export default async function TeamSettingsPage() {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) redirect('/sign-in');
  if (!session.session.activeOrganizationId) redirect('/dashboard');

  const [organization, activeRole] = await Promise.all([
    auth.api.getFullOrganization({ query: { organizationId: session.session.activeOrganizationId }, headers: requestHeaders }),
    auth.api.getActiveMemberRole({ headers: requestHeaders }),
  ]);
  if (!organization) redirect('/dashboard');

  const canInvite = activeRole.role === 'owner' || activeRole.role === 'admin';

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-16">
      <h1 className="text-4xl font-bold">Team</h1>
      <p className="mt-3 text-zinc-400">Invite members and review workspace access.</p>
      {canInvite ? <InviteMemberForm organizationId={organization.id} /> : <p className="mt-6 rounded-lg border border-zinc-800 p-4 text-sm text-zinc-400">Only owners and admins can invite teammates.</p>}
      <div className="mt-10 divide-y divide-zinc-800 rounded-2xl border border-zinc-800">
        {organization.members.map((member) => (
          <div key={member.id} className="flex items-center justify-between p-5">
            <div><p className="font-medium">{member.user.name}</p><p className="text-sm text-zinc-500">{member.user.email}</p></div>
            <span className="text-sm capitalize text-zinc-400">{member.role}</span>
          </div>
        ))}
      </div>
    </main>
  );
}
