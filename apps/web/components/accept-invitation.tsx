'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { authClient } from '@/lib/auth-client';

export function AcceptInvitation() {
  const router = useRouter();
  const params = useSearchParams();
  const invitationId = params.get('id');
  const { data: session, isPending } = authClient.useSession();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!invitationId) return <p className="text-red-300">Invitation ID is missing.</p>;
  const invitation = invitationId;
  if (isPending) return <p>Loading…</p>;
  if (!session) return <p className="text-zinc-300">Sign in with the invited email address first. <Link className="underline" href={`/sign-in`}>Sign in</Link></p>;

  async function accept() {
    setPending(true);
    setError(null);
    const result = await authClient.organization.acceptInvitation({ invitationId: invitation });
    if (result.error) {
      setError(result.error.message ?? 'Unable to accept invitation.');
      setPending(false);
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  return <div className="space-y-4"><p className="text-zinc-300">Signed in as <strong>{session.user.email}</strong>.</p>{error ? <p className="text-sm text-red-300">{error}</p> : null}<button onClick={accept} disabled={pending} className="rounded-lg bg-white px-5 py-3 font-semibold text-black disabled:opacity-50">{pending ? 'Joining…' : 'Accept invitation'}</button></div>;
}
