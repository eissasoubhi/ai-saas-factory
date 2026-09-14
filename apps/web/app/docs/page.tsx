import Link from 'next/link';

const sections = [
  {
    title: 'Build',
    description: 'Start from the monorepo, configure the minimum environment, and keep tenant boundaries server-owned.',
    links: [
      ['Architecture', '/docs/architecture'],
      ['Security model', '/docs/security'],
      ['Deployment', '/docs/deployment'],
    ],
  },
  {
    title: 'Operate',
    description: 'Run migrations, workers, billing, storage, RAG and observability with explicit operational checks.',
    links: [
      ['Billing', '/docs/billing'],
      ['RAG and storage', '/docs/rag'],
      ['Observability', '/docs/observability'],
    ],
  },
  {
    title: 'Extend',
    description: 'Use organization API keys, signed webhooks and the mobile client without moving authorization to the browser.',
    links: [
      ['Platform API', '/docs/platform-api'],
      ['Mobile', '/docs/mobile'],
      ['Sample vertical', '/demo'],
    ],
  },
] as const;

export default function DocsPage() {
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-16">
      <div className="max-w-3xl">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">AI SaaS Factory</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Build from production boundaries, not from placeholder screens.
        </h1>
        <p className="mt-5 text-lg leading-8 text-zinc-600 dark:text-zinc-300">
          The starter ships identity, tenant-aware billing, AI usage accounting, storage, RAG, API keys,
          webhooks, telemetry and mobile foundations. This hub maps the public documentation to the product
          surfaces a buyer needs to evaluate first.
        </p>
      </div>

      <section className="mt-12 grid gap-6 md:grid-cols-3">
        {sections.map((section) => (
          <article key={section.title} className="rounded-2xl border border-zinc-200 p-6 dark:border-zinc-800">
            <h2 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">{section.title}</h2>
            <p className="mt-3 min-h-20 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              {section.description}
            </p>
            <div className="mt-6 flex flex-col gap-2">
              {section.links.map(([label, href]) => (
                <Link
                  key={href}
                  href={href}
                  className="text-sm font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-100"
                >
                  {label} →
                </Link>
              ))}
            </div>
          </article>
        ))}
      </section>

      <div className="mt-12 rounded-2xl bg-zinc-950 p-8 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-950">
        <h2 className="text-2xl font-semibold">See the starter as a vertical product</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300 dark:text-zinc-700">
          The sample vertical demonstrates how the same tenant, AI, RAG, usage and webhook primitives compose
          into a focused B2B workflow without adding privileged demo-only shortcuts.
        </p>
        <Link href="/demo" className="mt-5 inline-block font-medium underline underline-offset-4">
          Open the sample vertical →
        </Link>
      </div>
    </main>
  );
}
