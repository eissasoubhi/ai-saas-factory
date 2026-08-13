import { openai } from '@ai-sdk/openai';
import { convertToModelMessages, streamText, type UIMessage } from 'ai';

export const maxDuration = 30;

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL) {
    return Response.json(
      { error: 'AI provider is not configured. Set OPENAI_API_KEY and OPENAI_MODEL.' },
      { status: 503 },
    );
  }

  const { messages }: { messages: UIMessage[] } = await request.json();

  const result = streamText({
    model: openai(process.env.OPENAI_MODEL),
    system: 'You are a concise assistant inside a B2B SaaS application.',
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
