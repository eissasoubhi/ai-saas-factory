import Link from 'next/link';
import { notFound } from 'next/navigation';

const docs = {
  'getting-started': {
    title: 'Getting started',
    summary: 'Bootstrap the monorepo, configure the minimum server environment, run migrations and verify the starter before adding product-specific features.',
    source: 'README.md',
    bullets: [
      'Use pnpm through Corepack and keep the frozen lockfile in CI.',
      'Configure PostgreSQL, Better Auth and the application URL before enabling provider-specific features.',
      'Apply committed Drizzle migrations; never generate production schema changes during deployment.',
      'Keep tenant identity and authorization on the server when adding new routes.',
    ],
  },
  architecture: {
    title: 'Architecture',
    summary: 'Understand the web, worker and shared-package boundaries that keep tenant state, async jobs and provider integrations separated.',
    source: 'docs/architecture.md',
    bullets: [
      'Next.js owns authenticated web and API surfaces.',
      'PostgreSQL is the durable source for tenant state, usage, jobs and audit data.',
      'The worker handles ingestion, webhook delivery and other retryable background work.',
      'Shared packages own contracts, entitlements, storage, telemetry and security primitives.',
    ],
  },
  security: {
    title: 'Security model',
    summary: 'Review the boundaries that prevent browser-controlled tenant escalation, secret leakage and unsafe outbound delivery.',
    source: 'docs/security.md',
    bullets: [
      'Authentication is not authorization; active organization context is derived server-side.',
      'Provider keys, storage credentials and webhook secrets never enter browser bundles.',
      'Signed URLs are short-lived bearer capabilities and are never written to telemetry.',
      'RAG document text is untrusted reference data, not executable instruction.',
    ],
  },
  deployment: {
    title: 'Deployment',
    summary: 'Use the provider-neutral deployment flow and release checklist before connecting production credentials.',
    source: 'docs/deployment.md',
    bullets: [
      'Build the web and worker from the same tested commit.',
      'Apply committed migrations before serving application traffic.',
      'Run external smoke checks with disposable test credentials before launch.',
      'Keep environment validation distinct from CI so secrets are not required in the public repository.',
    ],
  },
  billing: {
    title: 'Billing and usage accounting',
    summary: 'Stripe subscription state grants entitlements while immutable usage and credit ledgers account for AI consumption.',
    source: 'docs/billing.md',
    bullets: [
      'Checkout redirects never grant paid access directly.',
      'Verified Stripe state is synchronized into PostgreSQL.',
      'AI credit reservation happens before provider work and settlement uses measured configured cost.',
      'Closed-period overage reconciliation is durable and idempotent.',
    ],
  },
  rag: {
    title: 'Storage and RAG',
    summary: 'Private uploads, durable ingestion, embeddings and tenant-scoped retrieval form the knowledge layer.',
    source: 'docs/rag.md',
    bullets: [
      'Browsers never choose buckets or raw object keys.',
      'Workers reload tenant-scoped file state before touching storage.',
      'Vector retrieval filters both chunks and files by organization.',
      'Source markers are transported separately from trusted authorization state.',
    ],
  },
  observability: {
    title: 'Observability',
    summary: 'Audit logs, usage dashboards and structured telemetry expose operational evidence without leaking sensitive content.',
    source: 'docs/observability.md',
    bullets: [
      'Audit and usage views derive the active organization from the server session.',
      'Telemetry recursively redacts credentials, prompts, document bodies and signed URLs.',
      'Correlation IDs connect request and worker events without becoming secrets.',
      'Configured cost estimates are operational metrics, not provider invoices.',
    ],
  },
  'platform-api': {
    title: 'Platform API and webhooks',
    summary: 'Organization API keys and signed outbound webhooks provide a customer integration boundary with explicit scopes and retries.',
    source: 'docs/platform-api.md',
    bullets: [
      'API key hashes are stored instead of raw bearer tokens.',
      'Tenant context is derived from the persisted API key, never from browser organization headers.',
      'Outbound webhook URLs must resolve to public HTTPS targets.',
      'Webhook bodies are HMAC-signed and delivery uses retry plus dead-letter handling.',
    ],
  },
  mobile: {
    title: 'Mobile',
    summary: 'Expo reuses the same Better Auth and tenant APIs while keeping session material in SecureStore.',
    source: 'docs/mobile.md',
    bullets: [
      'Mobile does not introduce a second identity system.',
      'Production API URLs require HTTPS and explicit deep-link configuration.',
      'Workspace switching remains server-authoritative.',
      'Read-only dashboard, usage and files surfaces reuse tenant-scoped backend contracts.',
    ],
  },
} as const;

type DocSlug = keyof typeof docs;

export function generateStaticParams() {
  return Object.keys(docs).map((slug) => ({ slug }));
}

export default async function DocumentationTopicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = docs[slug as DocSlug];
  if (!entry) notFound();

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-16">
      <Link href="/docs" className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
        ← Documentation
      </Link>
      <h1 className="mt-8 text-4xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">{entry.title}</h1>
      <p className="mt-5 text-lg leading-8 text-zinc-600 dark:text-zinc-300">{entry.summary}</p>

      <ul className="mt-10 space-y-4">
        {entry.bullets.map((bullet) => (
          <li key={bullet} className="rounded-xl border border-zinc-200 p-4 text-sm leading-6 text-zinc-700 dark:border-zinc-800 dark:text-zinc-200">
            {bullet}
          </li>
        ))}
      </ul>

      <div className="mt-10 rounded-xl bg-zinc-100 p-5 text-sm text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
        Canonical source in the repository: <code className="font-mono">{entry.source}</code>
      </div>
    </main>
  );
}
