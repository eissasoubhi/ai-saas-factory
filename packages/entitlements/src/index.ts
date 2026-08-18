import type { PlanId } from '@factory/contracts';

export * from './credits';

export type Feature =
  | 'organizations'
  | 'team_members'
  | 'ai_requests_monthly'
  | 'audit_log_days'
  | 'api_keys';

export const plans: Record<PlanId, Record<Feature, number | boolean>> = {
  free: {
    organizations: 1,
    team_members: 1,
    ai_requests_monthly: 50,
    audit_log_days: 0,
    api_keys: false,
  },
  starter: {
    organizations: 3,
    team_members: 5,
    ai_requests_monthly: 2_000,
    audit_log_days: 7,
    api_keys: true,
  },
  pro: {
    organizations: 20,
    team_members: 50,
    ai_requests_monthly: 25_000,
    audit_log_days: 90,
    api_keys: true,
  },
};

export function entitlement(plan: PlanId, feature: Feature) {
  return plans[plan][feature];
}

export function allows(plan: PlanId, feature: Feature): boolean {
  const value = entitlement(plan, feature);
  return typeof value === 'boolean' ? value : value > 0;
}
