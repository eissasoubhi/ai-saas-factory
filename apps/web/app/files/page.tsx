import { listStoredFilesForOrganization } from '@factory/db';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FileActions } from '@/components/file-actions';
import { FileUploadPanel } from '@/components/file-upload-panel';
import { getActiveOrganizationContext } from '@/lib/organization-access';

function formatBytes(value: number | null) {
  if (value == null) return '—';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export default async function FilesPage() {
  const requestHeaders = new Headers(await headers());
  const context = await getActiveOrganizationContext(requestHeaders);
  if (!context) redirect('/dashboard');

  const files = await listStoredFilesForOrganization(context.organization.id);

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">{context.organization.name}</p>
          <h1 className="mt-2 text-4xl font-bold">Files & knowledge</h1>
          <p className="mt-3 max-w-2xl text-zinc-400">Private workspace files are extracted, chunked and embedded by the background worker. Ready files can be retrieved by AI knowledge mode.</p>
        </div>
        <Link href="/dashboard" className="rounded-lg border border-zinc-700 px-4 py-2 text-sm">Dashboard</Link>
      </div>

      <div className="mt-8"><FileUploadPanel /></div>

      <section className="mt-8 overflow-hidden rounded-2xl border border-zinc-800">
        <div className="border-b border-zinc-800 bg-zinc-950 px-5 py-4">
          <h2 className="font-semibold">Workspace files</h2>
        </div>
        {files.length === 0 ? (
          <p className="p-8 text-sm text-zinc-500">No files uploaded yet.</p>
        ) : (
          <div className="divide-y divide-zinc-800">
            {files.map((file) => (
              <article key={file.id} className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_140px_140px_auto] md:items-center">
                <div className="min-w-0">
                  <p className="truncate font-medium">{file.originalName}</p>
                  <p className="mt-1 truncate text-xs text-zinc-500">{file.contentType}</p>
                  {file.lastError ? <p className="mt-2 line-clamp-2 text-xs text-red-300">{file.lastError}</p> : null}
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-zinc-600">Size</p>
                  <p className="mt-1 text-sm">{formatBytes(file.actualSizeBytes ?? file.expectedSizeBytes)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-zinc-600">Knowledge</p>
                  <p className="mt-1 text-sm capitalize">{file.status}</p>
                </div>
                <FileActions fileId={file.id} status={file.status} />
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
