const tiers = [
  { name: 'Starter', price: '€129', note: 'One commercial project', features: ['Web edition', 'Organizations', 'Billing foundation', 'AI streaming'] },
  { name: 'Pro', price: '€249', note: 'Web + mobile', features: ['Everything in Starter', 'Expo app', 'Advanced modules', 'Product updates'] },
  { name: 'Agency', price: '€599', note: 'Multiple client projects', features: ['Everything in Pro', 'Agency usage rights', 'Priority updates', 'Extended examples'] },
];

export default function PricingPage() {
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-20">
      <h1 className="text-5xl font-bold">Pricing hypothesis</h1>
      <p className="mt-4 max-w-2xl text-zinc-400">These tiers are placeholders until the launch feature set and customer license are finalized.</p>
      <div className="mt-12 grid gap-5 md:grid-cols-3">
        {tiers.map((tier) => (
          <article key={tier.name} className="rounded-2xl border border-zinc-800 p-7">
            <h2 className="text-2xl font-semibold">{tier.name}</h2>
            <p className="mt-3 text-4xl font-bold">{tier.price}</p>
            <p className="mt-2 text-sm text-zinc-500">{tier.note}</p>
            <ul className="mt-7 space-y-3 text-zinc-300">
              {tier.features.map((feature) => <li key={feature}>✓ {feature}</li>)}
            </ul>
          </article>
        ))}
      </div>
    </main>
  );
}
