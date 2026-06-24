import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AuthVariables } from "../middleware/auth";
import { telegramAuth } from "../middleware/auth";
import { db } from "../db/client";
import { users } from "../db/schema";
import { getUserRole } from "../admin/roles";
import { getMembership } from "../membership/getMembership";

const avatarRefreshCooldownMs = 7 * 24 * 60 * 60 * 1000;

async function buildMeResponse(user: typeof users.$inferSelect, c: { get: <T extends keyof AuthVariables>(key: T) => AuthVariables[T] }) {
  const membership = await getMembership(user.id);
  const realRole = await getUserRole(user.telegramId);
  const role = c.get("previewRole") ?? realRole;
  const previewMembershipStatus = c.get("previewMembershipStatus");
  const membershipStatus = previewMembershipStatus ?? membership.status;
  const membershipExpiresAt =
    previewMembershipStatus === "active"
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      : previewMembershipStatus === "inactive"
        ? null
        : (membership.subscription?.expiresAt?.toISOString() ?? null);

  return {
    user: {
      id: user.id,
      telegramId: user.telegramId,
      firstName: user.firstName,
      username: user.username,
      photoUrl: user.photoUrl,
      role,
      realRole,
      membershipStatus,
      membershipExpiresAt,
      avatarRefreshedAt: user.avatarRefreshedAt?.toISOString() ?? null
    }
  };
}

export const meRoute = new Hono<{ Variables: AuthVariables }>()
  .use("*", telegramAuth)
  .get("/", async (c) => {
    const userId = c.get("userId");
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId)
    });

    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    return c.json(await buildMeResponse(user, c));
  })
  .post("/avatar", async (c) => {
    const userId = c.get("userId");
    const telegramUser = c.get("telegramUser");
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId)
    });

    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    const now = new Date();
    if (user.avatarRefreshedAt && now.getTime() - user.avatarRefreshedAt.getTime() < avatarRefreshCooldownMs) {
      const nextAllowedAt = new Date(user.avatarRefreshedAt.getTime() + avatarRefreshCooldownMs);
      return c.json({ error: "Avatar refresh is limited", nextAllowedAt: nextAllowedAt.toISOString() }, 429);
    }

    if (!telegramUser.photoUrl) {
      return c.json({ error: "Telegram avatar is unavailable" }, 400);
    }

    const [updatedUser] = await db
      .update(users)
      .set({
        photoUrl: telegramUser.photoUrl,
        avatarRefreshedAt: now,
        updatedAt: now
      })
      .where(eq(users.id, userId))
      .returning();

    if (!updatedUser) {
      return c.json({ error: "Unable to update avatar" }, 500);
    }

    return c.json(await buildMeResponse(updatedUser, c));
  });
