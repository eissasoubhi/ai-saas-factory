'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

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
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState('');
  const [selectedModelId, setSelectedModelId] = useState(modelId);
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
    setError(null);

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          message: prompt,
          modelId: selectedModelId,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `AI request failed with ${response.status}`);
      }

      const createdConversationId = response.headers.get('X-Conversation-Id');
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

      if (!conversationId && createdConversationId) {
        router.push(`/ai/${encodeURIComponent(createdConversationId)}`);
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
      </div>

      <form className="border-t border-zinc-800 p-4" onSubmit={submit}>
        {error ? <p className="mb-3 rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-300">{error}</p> : null}
        <div className="flex flex-col gap-3 sm:flex-row">
          {!conversationId && allowedModelIds.length > 1 ? (
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
