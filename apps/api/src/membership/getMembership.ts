import { desc, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { subscriptions } from "../db/schema";

export async function getMembership(userId: string) {
  const subscription = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.userId, userId),
    orderBy: [
      sql`case when ${subscriptions.status} = 'active' and ${subscriptions.expiresAt} is null then 0 else 1 end`,
      desc(subscriptions.createdAt)
    ]
  });

  const isActive =
    subscription?.status === "active" &&
    (!subscription.expiresAt || subscription.expiresAt.getTime() > Date.now());

  const status = isActive ? "active" : subscription?.status === "inactive" ? "inactive" : subscription ? "expired" : "inactive";

  return {
    subscription,
    status,
    isActive
  } as const;
}
