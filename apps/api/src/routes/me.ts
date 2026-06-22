import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AuthVariables } from "../middleware/auth";
import { telegramAuth } from "../middleware/auth";
import { db } from "../db/client";
import { users } from "../db/schema";
import { getUserRole } from "../admin/roles";
import { getMembership } from "../membership/getMembership";

export const meRoute = new Hono<{ Variables: AuthVariables }>().use("*", telegramAuth).get("/", async (c) => {
  const userId = c.get("userId");
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId)
  });

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  const membership = await getMembership(userId);
  const role = await getUserRole(user.telegramId);
  const previewMembershipStatus = c.get("previewMembershipStatus");
  const membershipStatus = previewMembershipStatus ?? membership.status;
  const membershipExpiresAt =
    previewMembershipStatus === "active"
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      : previewMembershipStatus === "inactive"
        ? null
        : (membership.subscription?.expiresAt?.toISOString() ?? null);

  return c.json({
    user: {
      id: user.id,
      telegramId: user.telegramId,
      firstName: user.firstName,
      username: user.username,
      role,
      membershipStatus,
      membershipExpiresAt
    }
  });
});
