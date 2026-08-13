'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';

export function EnsureActiveOrganization({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void authClient.organization.setActive({ organizationId }).then((result) => {
      if (cancelled) return;
      if (result.error) {
        setFailed(true);
        return;
      }
      router.refresh();
    });

    return () => { cancelled = true; };
  }, [organizationId, router]);

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-20">
      <h1 className="text-3xl font-bold">Preparing your workspace…</h1>
      <p className="mt-3 text-zinc-400">We are attaching your current session to the workspace.</p>
      {failed ? <p className="mt-5 text-red-300">The workspace could not be activated. Sign out and sign back in, then try again.</p> : null}
    </main>
  );
}
