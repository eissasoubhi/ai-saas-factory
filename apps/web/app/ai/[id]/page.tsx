import {
  getConversationForOrganization,
  listConversationMessages,
  listConversationsForOrganization,
} from '@factory/db';
import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChatPanel } from '@/components/chat-panel';
import { ConversationActions } from '@/components/conversation-actions';
import { getActiveOrganizationContext } from '@/lib/organization-access';

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const requestHeaders = new Headers(await headers());
  const context = await getActiveOrganizationContext(requestHeaders);
  if (!context) redirect('/dashboard');

  const { id } = await params;
  const conversation = await getConversationForOrganization(context.organization.id, id);
  if (!conversation) notFound();

  const [messages, conversations] = await Promise.all([
    listConversationMessages(context.organization.id, conversation.id),
    listConversationsForOrganization(context.organization.id, { includeArchived: true }),
  ]);

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">{context.organization.name}</p>
          <h1 className="mt-2 max-w-3xl truncate text-3xl font-bold">{conversation.title}</h1>
          <p className="mt-2 text-sm text-zinc-500">{conversation.modelId}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ConversationActions conversationId={conversation.id} archived={Boolean(conversation.archivedAt)} />
          <Link className="rounded-lg border border-zinc-700 px-4 py-2 text-sm" href="/ai">New conversation</Link>
        </div>
      </div>

      {conversation.archivedAt ? (
        <p className="mb-5 rounded-xl border border-amber-900/50 bg-amber-950/20 p-4 text-sm text-amber-300">
          This conversation is archived and read-only. Restore it to send another message.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <h2 className="font-semibold">Conversations</h2>
          <div className="mt-4 space-y-2">
            {conversations.map((item) => (
              <Link
                key={item.id}
                href={`/ai/${encodeURIComponent(item.id)}`}
                className={`block rounded-xl border p-3 ${item.id === conversation.id ? 'border-zinc-500 bg-zinc-900' : 'border-zinc-800 hover:border-zinc-600'}`}
              >
                <p className="truncate text-sm font-medium">{item.title}</p>
                <div className="mt-1 flex items-center justify-between gap-2 text-xs text-zinc-600">
                  <span className="truncate">{item.modelId}</span>
                  {item.archivedAt ? <span>Archived</span> : null}
                </div>
              </Link>
            ))}
          </div>
        </aside>

        <ChatPanel
          conversationId={conversation.id}
          initialMessages={messages.flatMap((message) =>
            message.role === 'user' || message.role === 'assistant'
              ? [{ id: message.id, role: message.role, content: message.content }]
              : [],
          )}
          modelId={conversation.modelId}
          allowedModelIds={[conversation.modelId]}
          readOnly={Boolean(conversation.archivedAt)}
        />
      </div>
    </main>
  );
}
