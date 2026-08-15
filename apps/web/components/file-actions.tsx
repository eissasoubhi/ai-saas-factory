'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function FileActions({ fileId, status }: { fileId: string; status: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/files/${encodeURIComponent(fileId)}/download`);
      const body = (await response.json().catch(() => null)) as { download?: { url?: string }; error?: string } | null;
      if (!response.ok || !body?.download?.url) throw new Error(body?.error ?? 'Unable to create download link.');
      window.location.assign(body.download.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Download failed.');
      setPending(false);
    }
  }

  async function retry() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/files/${encodeURIComponent(fileId)}/complete`, { method: 'POST' });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? 'Unable to retry file processing.');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Retry failed.');
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!window.confirm('Delete this file permanently from object storage?')) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Unable to delete file.');
      }
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Delete failed.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {status === 'ready' ? (
          <button type="button" disabled={pending} onClick={() => void download()} className="rounded-lg border border-zinc-700 px-3 py-2 text-xs disabled:opacity-50">Download</button>
        ) : null}
        {status === 'failed' || status === 'uploaded' ? (
          <button type="button" disabled={pending} onClick={() => void retry()} className="rounded-lg border border-zinc-700 px-3 py-2 text-xs disabled:opacity-50">Retry</button>
        ) : null}
        <button type="button" disabled={pending} onClick={() => void remove()} className="rounded-lg border border-red-900 px-3 py-2 text-xs text-red-300 disabled:opacity-50">Delete</button>
      </div>
      {error ? <p className="mt-2 max-w-sm text-xs text-red-300">{error}</p> : null}
    </div>
  );
}
