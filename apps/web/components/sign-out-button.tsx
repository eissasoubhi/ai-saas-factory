'use client';

import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';

export function SignOutButton() {
  const router = useRouter();
  return <button className="rounded-lg border border-zinc-700 px-3 py-2 text-sm" onClick={() => authClient.signOut({ fetchOptions: { onSuccess: () => { router.push('/sign-in'); router.refresh(); } } })}>Sign out</button>;
}
