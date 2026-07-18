import { and, count, eq, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import { supportTickets } from "../db/schema";

export async function getSupportUnreadCount({ userId, isSupportAdmin }: { userId: string; isSupportAdmin: boolean }) {
  const unreadCondition = isSupportAdmin
    ? and(
        ne(supportTickets.status, "closed"),
        isNotNull(supportTickets.lastCustomerMessageAt),
        or(
          isNull(supportTickets.adminReadAt),
          sql`${supportTickets.lastCustomerMessageAt} > ${supportTickets.adminReadAt}`
        )
      )
    : and(
        eq(supportTickets.userId, userId),
        isNotNull(supportTickets.lastAdminMessageAt),
        or(
          isNull(supportTickets.customerReadAt),
          sql`${supportTickets.lastAdminMessageAt} > ${supportTickets.customerReadAt}`
        )
      );

  const [row] = await db
    .select({ value: count(supportTickets.id) })
    .from(supportTickets)
    .where(unreadCondition);

  return row?.value ?? 0;
}
