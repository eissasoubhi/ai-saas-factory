'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function ConversationActions({ conversationId, archived }: { conversationId: string; archived: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setArchived(next: boolean) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/ai/conversations/${encodeURIComponent(conversationId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: next }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Unable to update conversation.');
      }
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update conversation.');
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!window.confirm('Delete this conversation permanently?')) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/ai/conversations/${encodeURIComponent(conversationId)}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Unable to delete conversation.');
      }
      router.push('/ai');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to delete conversation.');
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        className="rounded-lg border border-zinc-700 px-3 py-2 text-sm disabled:opacity-50"
        type="button"
        disabled={pending}
        onClick={() => void setArchived(!archived)}
      >
        {archived ? 'Restore' : 'Archive'}
      </button>
      <button
        className="rounded-lg border border-red-900 px-3 py-2 text-sm text-red-300 disabled:opacity-50"
        type="button"
        disabled={pending}
        onClick={() => void remove()}
      >
        Delete
      </button>
      {error ? <span className="text-sm text-red-300">{error}</span> : null}
    </div>
  );
}
