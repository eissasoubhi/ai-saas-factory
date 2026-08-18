import { and, eq, sql } from 'drizzle-orm';
import { database } from './index';
import { member } from './schema';

export async function countOrganizationOwners(organizationId: string) {
  const db = database();
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(member)
    .where(
      and(
        eq(member.organizationId, organizationId),
        sql`${member.role} ~ '(^|,)owner(,|$)'`,
      ),
    );
  return Number(row?.value ?? 0);
}
