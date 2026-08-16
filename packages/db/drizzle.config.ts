import { defineConfig } from 'drizzle-kit';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required for Drizzle CLI commands');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: ['./src/schema.ts', './src/rag-schema.ts', './src/platform-schema.ts'],
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL },
});
