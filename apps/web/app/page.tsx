import Link from 'next/link';

const features = [
  ['Organizations', 'Multi-tenant teams, roles and invitations without outsourcing your identity model.'],
  ['Billing-ready', 'Subscription state, webhook idempotency and entitlements are first-class data.'],
  ['AI-native', 'Streaming endpoints and a usage ledger designed for credits and token-based products.'],
  ['Mobile-ready', 'Expo lives in the same monorepo and shares contracts without importing server code.'],
];

export default function HomePage() {
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-16">
      <nav className="mb-24 flex items-center justify-between">
        <strong>AI SaaS Factory</strong>
        <div className="flex gap-3">
          <Link className="rounded-lg border border-zinc-700 px-4 py-2 text-sm" href="/pricing">Pricing</Link>
          <Link className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black" href="/dashboard">Demo dashboard</Link>
        </div>
      </nav>

      <section className="max-w-4xl">
        <p className="mb-5 text-sm font-semibold uppercase tracking-[0.2em] text-zinc-400">Commercial starter kit</p>
        <h1 className="text-5xl font-bold tracking-tight sm:text-7xl">Ship the product. Skip the SaaS plumbing.</h1>
        <p className="mt-7 max-w-2xl text-lg leading-8 text-zinc-400">
          A production-oriented Next.js + Expo foundation for B2B and AI SaaS products with auth, teams, billing policy, usage metering and agent-friendly architecture.
        </p>
      </section>

      <section className="mt-20 grid gap-4 md:grid-cols-2">
        {features.map(([title, body]) => (
          <article key={title} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-7">
            <h2 className="text-xl font-semibold">{title}</h2>
            <p className="mt-3 leading-7 text-zinc-400">{body}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
