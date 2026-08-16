import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as baseSchema from './schema';
import * as ragSchema from './rag-schema';
import * as platformSchema from './platform-schema';

const schema = { ...baseSchema, ...ragSchema, ...platformSchema };

let cached: ReturnType<typeof createDb> | undefined;

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  const client = postgres(url, { max: process.env.NODE_ENV === 'production' ? 10 : 1 });
  const db = drizzle(client, { schema });
  return { db, client };
}

export function database() {
  cached ??= createDb();
  return cached.db;
}

export { schema };
export * from './ai';
export * from './ai-policy';
export * from './billing';
export * from './files';
export * from './observability';
export * from './platform';
export * from './rag';
