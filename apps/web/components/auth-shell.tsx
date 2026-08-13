import Link from 'next/link';

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <Link href="/" className="text-sm font-semibold text-zinc-400">← AI SaaS Factory</Link>
        <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-950 p-7">
          <h1 className="text-3xl font-bold">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-400">{subtitle}</p>
          <div className="mt-7">{children}</div>
        </div>
      </div>
    </main>
  );
}
