'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';

export function OnboardingForm({ suggestedName }: { suggestedName: string }) {
  const router = useRouter();
  const [name, setName] = useState(suggestedName ? `${suggestedName}'s workspace` : 'My workspace');
  const [slug, setSlug] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const normalizedSlug = useMemo(() => slugify(slug || name), [slug, name]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const result = await authClient.organization.create({ name: name.trim(), slug: normalizedSlug });
    if (result.error || !result.data) {
      setError(result.error?.message ?? 'Unable to create workspace.');
      setPending(false);
      return;
    }

    await authClient.organization.setActive({ organizationId: result.data.id });
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-5">
      <label className="block text-sm"><span className="mb-2 block font-medium text-zinc-300">Workspace name</span><input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5" /></label>
      <label className="block text-sm"><span className="mb-2 block font-medium text-zinc-300">Slug</span><input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder={normalizedSlug} className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5" /><span className="mt-2 block text-xs text-zinc-500">{normalizedSlug || 'workspace-slug'}</span></label>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      <button disabled={pending || normalizedSlug.length < 3} className="rounded-lg bg-white px-5 py-3 font-semibold text-black disabled:opacity-50">{pending ? 'Creating…' : 'Create workspace'}</button>
    </form>
  );
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
}
