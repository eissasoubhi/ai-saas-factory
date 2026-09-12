import {
  getOrganizationUsageOverview,
  getSubscriptionForOrganization,
  getUsageCreditBalance,
  paidPlanForSubscription,
  usageCreditPeriodKey,
} from '@factory/db';
import { mobileOverviewResponseSchema } from '@factory/contracts';
import { aiCreditPolicy, entitlement } from '@factory/entitlements';
import { getActiveOrganizationContext } from '@/lib/organization-access';

export async function GET(request: Request) {
  const context = await getActiveOrganizationContext(request.headers);
  if (!context) {
    return Response.json({ error: 'Authentication and an active workspace are required.' }, { status: 401 });
  }

  const [usage, subscription] = await Promise.all([
    getOrganizationUsageOverview(context.organization.id),
    getSubscriptionForOrganization(context.organization.id),
  ]);
  const plan = paidPlanForSubscription(subscription);
  const creditPolicy = aiCreditPolicy(plan);
  const creditBalanceMicros = await getUsageCreditBalance(
    context.organization.id,
    usageCreditPeriodKey(),
  );

  const response = mobileOverviewResponseSchema.parse({
    organization: {
      id: context.organization.id,
      name: context.organization.name,
      slug: context.organization.slug,
      role: context.role,
    },
    usage: {
      monthStart: usage.monthStart.toISOString(),
      plan,
      requests: usage.requests,
      requestLimit: entitlement(plan, 'ai_requests_monthly'),
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      embeddingTokens: usage.embeddingTokens,
      estimatedCostMicros: usage.totalCostMicros,
      creditBalanceMicros,
      includedCreditMicros: creditPolicy.includedMicros,
      overageAllowed: creditPolicy.overageAllowed,
    },
  });

  return Response.json(response, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
