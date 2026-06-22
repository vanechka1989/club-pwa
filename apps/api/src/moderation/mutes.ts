import { and, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "../db/client";
import { userMutes } from "../db/schema";

export async function getActiveMute(userId: string) {
  const now = new Date();

  return db.query.userMutes.findFirst({
    where: and(
      eq(userMutes.userId, userId),
      isNull(userMutes.revokedAt),
      or(eq(userMutes.kind, "permanent"), gt(userMutes.expiresAt, now))
    ),
    orderBy: (table, { desc }) => [desc(table.createdAt)]
  });
}
