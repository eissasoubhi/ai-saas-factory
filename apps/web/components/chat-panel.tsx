'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { decodeRagSourcesHeader, type RagSource } from '@/lib/rag-context';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

export function ChatPanel({
  conversationId,
  initialMessages,
  modelId,
  allowedModelIds,
  readOnly = false,
}: {
  conversationId?: string;
  initialMessages: ChatMessage[];
  modelId: string;
  allowedModelIds: string[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [activeConversationId, setActiveConversationId] = useState(conversationId);
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState('');
  const [selectedModelId, setSelectedModelId] = useState(modelId);
  const [useKnowledge, setUseKnowledge] = useState(false);
  const [sources, setSources] = useState<RagSource[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = input.trim();
    if (!prompt || pending || readOnly) return;

    const userId = `local-user-${Date.now()}`;
    const assistantId = `local-assistant-${Date.now()}`;
    setMessages((current) => [
      ...current,
      { id: userId, role: 'user', content: prompt },
      { id: assistantId, role: 'assistant', content: '' },
    ]);
    setInput('');
    setPending(true);
    setSources([]);
    setError(null);

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: activeConversationId,
          message: prompt,
          modelId: selectedModelId,
          useKnowledge,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `AI request failed with ${response.status}`);
      }

      const createdConversationId = response.headers.get('X-Conversation-Id');
      setSources(decodeRagSourcesHeader(response.headers.get('X-RAG-Sources')));
      const reader = response.body?.getReader();
      if (!reader) throw new Error('AI response stream is unavailable.');
      const decoder = new TextDecoder();
      let assistantText = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        assistantText += decoder.decode(value, { stream: true });
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId ? { ...message, content: assistantText } : message,
          ),
        );
      }
      assistantText += decoder.decode();

      if (!activeConversationId && createdConversationId) {
        setActiveConversationId(createdConversationId);
        window.history.replaceState(null, '', `/ai/${encodeURIComponent(createdConversationId)}`);
      } else {
        router.refresh();
      }
    } catch (cause) {
      setMessages((current) => current.filter((message) => message.id !== assistantId));
      setError(cause instanceof Error ? cause.message : 'AI request failed.');
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="flex min-h-[70vh] flex-col rounded-2xl border border-zinc-800 bg-zinc-950">
      <div className="flex-1 space-y-5 overflow-y-auto p-6">
        {messages.length === 0 ? (
          <div className="mx-auto mt-24 max-w-md text-center">
            <h2 className="text-2xl font-semibold">Start a conversation</h2>
            <p className="mt-3 text-sm text-zinc-500">Messages are stored in your active workspace and metered against its AI plan.</p>
          </div>
        ) : (
          messages.map((message) => (
            <article
              key={message.id}
              className={message.role === 'user' ? 'ml-auto max-w-2xl rounded-2xl bg-zinc-800 p-4' : 'mr-auto max-w-3xl p-2'}
            >
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">{message.role}</p>
              <p className="whitespace-pre-wrap leading-7 text-zinc-100">{message.content || (pending ? '…' : '')}</p>
            </article>
          ))
        )}

        {sources.length > 0 ? (
          <aside className="mr-auto max-w-3xl rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">Knowledge sources</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {sources.map((source, index) => (
                <span key={source.chunkId} className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300">
                  [S{index + 1}] {source.fileName} · chunk {source.chunkIndex} · {Math.round(source.similarity * 100)}%
                </span>
              ))}
            </div>
          </aside>
        ) : null}
      </div>

      <form className="border-t border-zinc-800 p-4" onSubmit={submit}>
        {error ? <p className="mb-3 rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-300">{error}</p> : null}
        <label className="mb-3 flex items-center gap-2 text-sm text-zinc-400">
          <input
            type="checkbox"
            checked={useKnowledge}
            disabled={pending || readOnly}
            onChange={(event) => setUseKnowledge(event.target.checked)}
          />
          Use workspace knowledge
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          {!activeConversationId && allowedModelIds.length > 1 ? (
            <select
              aria-label="AI model"
              className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-3 text-sm"
              value={selectedModelId}
              onChange={(event) => setSelectedModelId(event.target.value)}
              disabled={pending || readOnly}
            >
              {allowedModelIds.map((id) => <option key={id} value={id}>{id}</option>)}
            </select>
          ) : null}
          <textarea
            className="min-h-24 flex-1 resize-y rounded-xl border border-zinc-700 bg-zinc-900 p-3 text-sm outline-none focus:border-zinc-500"
            placeholder={readOnly ? 'Restore this conversation to continue.' : 'Ask anything…'}
            value={input}
            maxLength={20_000}
            disabled={pending || readOnly}
            onChange={(event) => setInput(event.target.value)}
          />
          <button
            className="self-end rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
            disabled={pending || readOnly || !input.trim()}
            type="submit"
          >
            {pending ? 'Thinking…' : 'Send'}
          </button>
        </div>
      </form>
    </section>
  );
}
