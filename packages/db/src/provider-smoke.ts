import postgres from 'postgres';

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
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error('DATABASE_URL is required for the pgvector provider smoke');

  const vector = vectorLiteral(embedding);
  const opposite = vectorLiteral(embedding.map((value) => -value));
  const client = postgres(url, { max: 1 });

  try {
    return await client.begin(async (sql) => {
      await sql.unsafe(`
        create temporary table provider_smoke_vectors (
          id text primary key,
          embedding vector(1536) not null
        ) on commit drop
      `);
      await sql`
        insert into provider_smoke_vectors (id, embedding)
        values ('expected', ${vector}::vector), ('opposite', ${opposite}::vector)
      `;
      const rows = await sql<{ id: string; similarity: number | string }[]>`
        select id, 1 - (embedding <=> ${vector}::vector) as similarity
        from provider_smoke_vectors
        order by embedding <=> ${vector}::vector asc
        limit 1
      `;
      const row = rows[0];
      if (!row || row.id !== 'expected') {
        throw new Error('pgvector smoke retrieval did not return the expected synthetic vector');
      }
      const similarity = Number(row.similarity);
      if (!Number.isFinite(similarity) || similarity < 0.999) {
        throw new Error(`pgvector smoke retrieval similarity was ${String(row.similarity)}`);
      }
      return { id: row.id, similarity };
    });
  } finally {
    await client.end({ timeout: 5 });
  }
}
