import { listConversationsForOrganization } from '@factory/db';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChatPanel } from '@/components/chat-panel';
import { allowedAiModelIds, defaultAiModelId } from '@/lib/ai-models';
import { getActiveOrganizationContext } from '@/lib/organization-access';

export default async function AiPage() {
  const requestHeaders = new Headers(await headers());
  const context = await getActiveOrganizationContext(requestHeaders);
  if (!context) redirect('/dashboard');

  const conversations = await listConversationsForOrganization(context.organization.id);
  const allowedModels = allowedAiModelIds();

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">{context.organization.name}</p>
          <h1 className="mt-2 text-4xl font-bold">AI workspace</h1>
          <p className="mt-2 text-zinc-400">Persisted conversations, server-side quotas and per-generation metering.</p>
        </div>
        <Link className="rounded-lg border border-zinc-700 px-4 py-2 text-sm" href="/dashboard">Dashboard</Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">Conversations</h2>
            <span className="text-xs text-zinc-600">{conversations.length}</span>
          </div>
          <div className="mt-4 space-y-2">
            {conversations.length === 0 ? <p className="text-sm text-zinc-500">No conversations yet.</p> : null}
            {conversations.map((conversation) => (
              <Link
                key={conversation.id}
                href={`/ai/${encodeURIComponent(conversation.id)}`}
                className="block rounded-xl border border-zinc-800 p-3 hover:border-zinc-600"
              >
                <p className="truncate text-sm font-medium">{conversation.title}</p>
                <p className="mt-1 truncate text-xs text-zinc-600">{conversation.modelId}</p>
              </Link>
            ))}
          </div>
        </aside>

        <ChatPanel
          initialMessages={[]}
          modelId={defaultAiModelId()}
          allowedModelIds={allowedModels}
        />
      </div>
    </main>
  );
}
