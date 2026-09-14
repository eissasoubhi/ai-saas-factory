const workflow = [
  ['1', 'Upload knowledge', 'Private tenant files are uploaded through short-lived signed URLs and processed by the worker.'],
  ['2', 'Ask with RAG', 'The AI route retrieves only chunks belonging to the active workspace and treats document text as untrusted data.'],
  ['3', 'Meter usage', 'Requests, tokens, configured cost and credits are recorded server-side before customer billing reconciliation.'],
  ['4', 'Notify systems', 'Completed AI/file events can be delivered through signed outbound webhooks with retry and DLQ handling.'],
] as const;

export default function DemoPage() {
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-16">
      <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
        <section>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">Sample vertical</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            Workspace Knowledge Assistant
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-zinc-600 dark:text-zinc-300">
            A concrete B2B example assembled entirely from the starter&apos;s existing primitives: organizations,
            private files, RAG, AI usage accounting, billing and signed integration events.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {workflow.map(([number, title, description]) => (
              <article key={number} className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-950 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-950">
                  {number}
                </div>
                <h2 className="mt-4 font-semibold text-zinc-950 dark:text-zinc-50">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{description}</p>
              </article>
            ))}
          </div>
        </section>

        <aside className="rounded-3xl border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">Acme Workspace</p>
            <h2 className="mt-3 text-xl font-semibold text-zinc-950 dark:text-zinc-50">Knowledge assistant</h2>
            <div className="mt-5 rounded-xl bg-zinc-100 p-4 text-sm leading-6 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
              “Summarize our onboarding policy and cite the source files.”
            </div>
            <div className="mt-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
              <p className="text-sm font-medium text-zinc-950 dark:text-zinc-50">Answer preview</p>
              <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                The assistant would answer from tenant-scoped retrieved chunks and expose source markers such as
                [S1] rather than trusting browser-supplied context.
              </p>
            </div>
          </div>

          <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-zinc-500">Tenant boundary</dt>
              <dd className="mt-1 font-medium text-zinc-950 dark:text-zinc-50">Server owned</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Usage</dt>
              <dd className="mt-1 font-medium text-zinc-950 dark:text-zinc-50">Metered</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Files</dt>
              <dd className="mt-1 font-medium text-zinc-950 dark:text-zinc-50">Private</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Events</dt>
              <dd className="mt-1 font-medium text-zinc-950 dark:text-zinc-50">Signed</dd>
            </div>
          </dl>
        </aside>
      </div>
    </main>
  );
}
