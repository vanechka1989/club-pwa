import { desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { subscriptions } from "../db/schema";

export async function getMembership(userId: string) {
  const subscription = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.userId, userId),
    orderBy: [desc(subscriptions.createdAt)]
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
