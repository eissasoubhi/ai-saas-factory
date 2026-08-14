import { openai } from '@ai-sdk/openai';
import { getMonthlyUsage, getSubscriptionForOrganization, paidPlanForSubscription, recordUsage } from '@factory/db';
import { entitlement } from '@factory/entitlements';
import { convertToModelMessages, streamText, type UIMessage } from 'ai';
import { auth } from '@/lib/auth';

export const maxDuration = 30;
export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL) {
    return Response.json(
      { error: 'AI provider is not configured. Set OPENAI_API_KEY and OPENAI_MODEL.' },
      { status: 503 },
    );
  }

  const session = await auth.api.getSession({ headers: request.headers });
  const organizationId = session?.session.activeOrganizationId;
  if (!session || !organizationId) {
    return Response.json({ error: 'Authentication and an active workspace are required.' }, { status: 401 });
  }

  const [snapshot, used] = await Promise.all([
    getSubscriptionForOrganization(organizationId),
    getMonthlyUsage(organizationId, 'ai.requests'),
  ]);
  const plan = paidPlanForSubscription(snapshot);
  const limit = entitlement(plan, 'ai_requests_monthly') as number;
  if (used >= limit) {
    return Response.json(
      { error: `Monthly AI request limit reached for the ${plan} plan.`, limit, used },
      { status: 429 },
    );
  }

  const body = (await request.json()) as { messages?: UIMessage[] };
  if (!Array.isArray(body.messages)) {
    return Response.json({ error: 'messages must be an array.' }, { status: 400 });
  }

  await recordUsage({
    organizationId,
    actorUserId: session.user.id,
    metric: 'ai.requests',
    quantity: 1,
    idempotencyKey: `ai-request/${organizationId}/${crypto.randomUUID()}`,
    metadata: { plan, model: process.env.OPENAI_MODEL },
  });

  const result = streamText({
    model: openai(process.env.OPENAI_MODEL),
    system: 'You are a concise assistant inside a B2B SaaS application.',
    messages: await convertToModelMessages(body.messages),
  });

  return result.toUIMessageStreamResponse();
}