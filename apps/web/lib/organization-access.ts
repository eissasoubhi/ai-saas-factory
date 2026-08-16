import { auth } from './auth';

export type OrganizationRole = 'owner' | 'admin' | 'member';

export async function getActiveOrganizationContext(requestHeaders: Headers) {
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.session.activeOrganizationId) return null;

  const [organization, activeRole] = await Promise.all([
    auth.api.getFullOrganization({
      query: { organizationId: session.session.activeOrganizationId },
      headers: requestHeaders,
    }),
    auth.api.getActiveMemberRole({ headers: requestHeaders }),
  ]);

  if (!organization) return null;
  return {
    session,
    organization,
    role: activeRole.role as OrganizationRole,
  };
}

export async function requireBillingManager(requestHeaders: Headers) {
  const context = await getActiveOrganizationContext(requestHeaders);
  if (!context) return { ok: false as const, status: 401, error: 'Authentication and an active workspace are required.' };
  if (context.role !== 'owner' && context.role !== 'admin') {
    return { ok: false as const, status: 403, error: 'Only workspace owners and admins can manage billing.' };
  }
  return { ok: true as const, context };
}

export async function requirePlatformManager(requestHeaders: Headers) {
  const context = await getActiveOrganizationContext(requestHeaders);
  if (!context) return { ok: false as const, status: 401, error: 'Authentication and an active workspace are required.' };
  if (context.role !== 'owner' && context.role !== 'admin') {
    return { ok: false as const, status: 403, error: 'Only workspace owners and admins can manage API keys and webhooks.' };
  }
  return { ok: true as const, context };
}
