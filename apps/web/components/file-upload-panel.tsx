'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

type UploadInitResponse = {
  file?: { id: string };
  upload?: { url: string; headers: Record<string, string> };
  error?: string;
};

export function FileUploadPanel() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || pending) return;
    setPending(true);
    setError(null);

    try {
      const init = await fetch('/api/files/uploads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          purpose: 'knowledge',
        }),
      });
      const initBody = (await init.json().catch(() => null)) as UploadInitResponse | null;
      if (!init.ok || !initBody?.file || !initBody.upload) {
        throw new Error(initBody?.error ?? 'Unable to initialize upload.');
      }

      const upload = await fetch(initBody.upload.url, {
        method: 'PUT',
        headers: initBody.upload.headers,
        body: file,
      });
      if (!upload.ok) throw new Error(`Object storage upload failed with ${upload.status}.`);

      const complete = await fetch(`/api/files/${encodeURIComponent(initBody.file.id)}/complete`, { method: 'POST' });
      const completeBody = (await complete.json().catch(() => null)) as { error?: string } | null;
      if (!complete.ok) throw new Error(completeBody?.error ?? 'Unable to finalize upload.');

      setFile(null);
      const input = document.getElementById('knowledge-file-input') as HTMLInputElement | null;
      if (input) input.value = '';
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Upload failed.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
      <h2 className="text-lg font-semibold">Upload knowledge file</h2>
      <p className="mt-2 text-sm text-zinc-500">PDF, text, Markdown, CSV or JSON. The file uploads directly to private object storage.</p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          id="knowledge-file-input"
          type="file"
          className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 p-2 text-sm"
          disabled={pending}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        <button
          type="submit"
          disabled={!file || pending}
          className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
        >
          {pending ? 'Uploading…' : 'Upload'}
        </button>
      </div>
      {file ? <p className="mt-3 text-xs text-zinc-500">{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</p> : null}
      {error ? <p className="mt-3 rounded-lg border border-red-900/50 bg-red-950/20 p-3 text-sm text-red-300">{error}</p> : null}
    </form>
  );
}
