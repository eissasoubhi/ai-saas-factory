import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import {
  database,
  getOrganizationSeatUsage,
  getSubscriptionForOrganization,
  paidPlanForSubscription,
  schema,
} from '@factory/db';
import { entitlement } from '@factory/entitlements';
import { APIError } from 'better-auth/api';
import { betterAuth } from 'better-auth/minimal';
import { organization } from 'better-auth/plugins';
import { recordAuditEvent } from './audit';
import { sendTransactionalEmail } from './email';

const baseURL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';

async function teamSeatLimit(organizationId: string) {
  const subscription = await getSubscriptionForOrganization(organizationId);
  return entitlement(paidPlanForSubscription(subscription), 'team_members') as number;
}

async function enforceInvitationSeatLimit(organizationId: string) {
  const [limit, usage] = await Promise.all([
    teamSeatLimit(organizationId),
    getOrganizationSeatUsage(organizationId),
  ]);
  if (usage.members + usage.pendingInvitations >= limit) {
    throw new APIError('FORBIDDEN', {
      message: `This workspace has reached its ${limit}-seat plan limit. Upgrade billing before inviting another member.`,
    });
  }
}

async function enforceMemberSeatLimit(organizationId: string) {
  const [limit, usage] = await Promise.all([
    teamSeatLimit(organizationId),
    getOrganizationSeatUsage(organizationId),
  ]);
  if (usage.members >= limit) {
    throw new APIError('FORBIDDEN', {
      message: `This workspace has reached its ${limit}-seat plan limit.`,
    });
  }
}

export const auth = betterAuth({
  appName: 'AI SaaS Factory',
  baseURL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(database(), { provider: 'pg', schema }),
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    async sendVerificationEmail({ user, url, token }) {
      void sendTransactionalEmail({
        to: user.email,
        subject: 'Verify your email address',
        text: `Welcome to AI SaaS Factory. Verify your email address:\n\n${url}\n\nIf you did not create this account, you can ignore this email.`,
        idempotencyKey: `verify-email/${user.id}/${token}`,
      });
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    async sendResetPassword({ user, url, token }) {
      void sendTransactionalEmail({
        to: user.email,
        subject: 'Reset your password',
        text: `Reset your AI SaaS Factory password:\n\n${url}\n\nIf you did not request this, you can ignore this email.`,
        idempotencyKey: `reset-password/${user.id}/${token}`,
      });
    },
  },
  plugins: [
    organization({
      requireEmailVerificationOnInvitation: true,
      invitationExpiresIn: 60 * 60 * 48,
      organizationHooks: {
        async beforeCreateInvitation({ organization: targetOrganization }) {
          await enforceInvitationSeatLimit(targetOrganization.id);
        },
        async beforeAddMember({ organization: targetOrganization }) {
          await enforceMemberSeatLimit(targetOrganization.id);
        },
        async afterCreateOrganization({ organization: createdOrganization, user }) {
          await recordAuditEvent({
            organizationId: createdOrganization.id,
            actorUserId: user.id,
            action: 'organization.created',
            entityType: 'organization',
            entityId: createdOrganization.id,
            metadata: { name: createdOrganization.name, slug: createdOrganization.slug },
          });
        },
        async afterUpdateOrganization({ organization: updatedOrganization, user }) {
          if (!updatedOrganization) return;
          await recordAuditEvent({
            organizationId: updatedOrganization.id,
            actorUserId: user.id,
            action: 'organization.updated',
            entityType: 'organization',
            entityId: updatedOrganization.id,
            metadata: { name: updatedOrganization.name, slug: updatedOrganization.slug },
          });
        },
        async afterCreateInvitation({ invitation, organization: targetOrganization }) {
          await recordAuditEvent({
            organizationId: targetOrganization.id,
            actorUserId: invitation.inviterId,
            action: 'member.invited',
            entityType: 'invitation',
            entityId: invitation.id,
            metadata: { role: invitation.role },
          });
        },
        async afterAcceptInvitation({ invitation, member, user, organization: targetOrganization }) {
          await recordAuditEvent({
            organizationId: targetOrganization.id,
            actorUserId: user.id,
            action: 'invitation.accepted',
            entityType: 'member',
            entityId: member.id,
            metadata: { invitationId: invitation.id, role: member.role, memberUserId: member.userId },
          });
        },
        async afterAddMember({ member, organization: targetOrganization }) {
          await recordAuditEvent({
            organizationId: targetOrganization.id,
            action: 'member.added',
            entityType: 'member',
            entityId: member.id,
            metadata: { memberUserId: member.userId, role: member.role },
          });
        },
        async afterRemoveMember({ member, organization: targetOrganization }) {
          await recordAuditEvent({
            organizationId: targetOrganization.id,
            action: 'member.removed',
            entityType: 'member',
            entityId: member.id,
            metadata: { memberUserId: member.userId, role: member.role },
          });
        },
        async afterUpdateMemberRole({ member, previousRole, organization: targetOrganization }) {
          await recordAuditEvent({
            organizationId: targetOrganization.id,
            action: 'member.role_updated',
            entityType: 'member',
            entityId: member.id,
            metadata: { memberUserId: member.userId, previousRole, role: member.role },
          });
        },
      },
      async sendInvitationEmail(data) {
        const inviteLink = `${baseURL}/accept-invitation?id=${encodeURIComponent(data.id)}`;
        void sendTransactionalEmail({
          to: data.email,
          subject: `Join ${data.organization.name}`,
          text: `${data.inviter.user.name} invited you to join ${data.organization.name} on AI SaaS Factory.\n\nAccept the invitation:\n${inviteLink}`,
          idempotencyKey: `organization-invitation/${data.id}`,
        });
      },
    }),
  ],
});