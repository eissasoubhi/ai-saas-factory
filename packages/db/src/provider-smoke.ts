import { sql } from 'drizzle-orm';
import { database } from './index';

function vectorLiteral(values: readonly number[]) {
  if (values.length !== 1536) {
    throw new Error(`Provider smoke expects a 1536-dimension embedding, received ${values.length}`);
  }
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error('Provider smoke embedding contains a non-finite value');
  }
  return `[${values.join(',')}]`;
}

export async function smokePgVectorRetrieval(embedding: readonly number[]) {
  const vector = vectorLiteral(embedding);
  const opposite = vectorLiteral(embedding.map((value) => -value));
  const db = database();

  return db.transaction(async (tx) => {
    await tx.execute(sql`
      create temporary table provider_smoke_vectors (
        id text primary key,
        embedding vector(1536) not null
      ) on commit drop
    `);
    await tx.execute(sql`
      insert into provider_smoke_vectors (id, embedding)
      values ('expected', ${vector}::vector), ('opposite', ${opposite}::vector)
    `);
    const result = await tx.execute<{ id: string; similarity: number | string }>(sql`
      select id, 1 - (embedding <=> ${vector}::vector) as similarity
      from provider_smoke_vectors
      order by embedding <=> ${vector}::vector asc
      limit 1
    `);
    const row = result[0];
    if (!row || row.id !== 'expected') {
      throw new Error('pgvector smoke retrieval did not return the expected synthetic vector');
    }
    const similarity = Number(row.similarity);
    if (!Number.isFinite(similarity) || similarity < 0.999) {
      throw new Error(`pgvector smoke retrieval similarity was ${String(row.similarity)}`);
    }
    return { id: row.id, similarity };
  });
}
