import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { database, schema } from '@factory/db';
import { betterAuth } from 'better-auth/minimal';
import { organization } from 'better-auth/plugins';
import { sendTransactionalEmail } from './email';

const baseURL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';

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
