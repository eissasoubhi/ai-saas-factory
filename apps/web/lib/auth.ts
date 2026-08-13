import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { database } from '@factory/db';
import { betterAuth } from 'better-auth/minimal';
import { organization } from 'better-auth/plugins';

export const auth = betterAuth({
  appName: 'AI SaaS Factory',
  database: drizzleAdapter(database(), { provider: 'pg' }),
  emailAndPassword: { enabled: true },
  advanced: { database: { joins: true } },
  plugins: [
    organization({
      requireEmailVerificationOnInvitation: true,
    }),
  ],
});
