'use client';

import { FormEvent, useState } from 'react';
import { authClient } from '@/lib/auth-client';

export function InviteMemberForm({ organizationId }: { organizationId: string }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    setError(null);
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const role = String(form.get('role') ?? 'member') as 'member' | 'admin';
    const result = await authClient.organization.inviteMember({ email, role, organizationId });
    if (result.error) setError(result.error.message ?? 'Unable to send invitation.');
    else { setMessage(`Invitation sent to ${email}.`); event.currentTarget.reset(); }
    setPending(false);
  }

  return <form onSubmit={submit} className="mt-6 flex flex-col gap-3 sm:flex-row"><input name="email" type="email" required placeholder="teammate@example.com" className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5" /><select name="role" defaultValue="member" className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5"><option value="member">Member</option><option value="admin">Admin</option></select><button disabled={pending} className="rounded-lg bg-white px-4 py-2.5 font-semibold text-black disabled:opacity-50">Invite</button>{message ? <p className="text-sm text-zinc-300 sm:basis-full">{message}</p> : null}{error ? <p className="text-sm text-red-300 sm:basis-full">{error}</p> : null}</form>;
}
