import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

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
