import { prisma } from "@/lib/db/prisma";

/** The extra columns that at least one contact of the workspace has (city, amount, ...): the names a message may use besides the four built in. */
export async function getCustomFieldKeys(organizationId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ key: string }[]>`
    SELECT DISTINCT jsonb_object_keys("customFields") AS key
    FROM "Contact"
    WHERE "organizationId" = ${organizationId} AND "customFields" IS NOT NULL AND jsonb_typeof("customFields") = 'object'
    LIMIT 200`;
  return rows.map(row => row.key);
}
