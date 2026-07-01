import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { deviceDiagnosticsSchema } from "@club/shared";
import type { AuthVariables } from "../middleware/auth";
import { telegramAuth } from "../middleware/auth";
import { db } from "../db/client";
import { userRecurrentSubscriptions, users } from "../db/schema";
import { getAdminAccessProfile, getUserRole } from "../admin/roles";
import { getMembership } from "../membership/getMembership";
import { resolveMembershipProfileFields } from "../membership/profileFields";

const avatarRefreshCooldownMs = 7 * 24 * 60 * 60 * 1000;

async function buildMeResponse(user: typeof users.$inferSelect, c: { get: <T extends keyof AuthVariables>(key: T) => AuthVariables[T] }) {
  const membership = await getMembership(user.id);
  const recurrentSubscription =
    membership.subscription?.provider === "prodamus_recurrent"
      ? await db.query.userRecurrentSubscriptions.findFirst({
          where: eq(userRecurrentSubscriptions.userId, user.id),
          orderBy: [desc(userRecurrentSubscriptions.updatedAt)]
        })
      : null;
  const realRole = await getUserRole(user.telegramId);
  const role = c.get("previewRole") ?? realRole;
  const adminAccess = await getAdminAccessProfile(user.telegramId);
  const previewMembershipStatus = c.get("previewMembershipStatus");
  const membershipStatus = previewMembershipStatus ?? membership.status;
  const rawMembershipExpiresAt =
    previewMembershipStatus === "active"
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      : previewMembershipStatus === "inactive"
        ? null
        : (membership.subscription?.expiresAt?.toISOString() ?? null);
  const membershipProfile = resolveMembershipProfileFields({
    membershipStatus,
    subscriptionProvider: membership.subscription?.provider ?? null,
    subscriptionExpiresAt: rawMembershipExpiresAt ? new Date(rawMembershipExpiresAt) : null,
    recurrentPaymentStatus: recurrentSubscription?.status ?? null
  });

  return {
    user: {
      id: user.id,
      telegramId: user.telegramId,
      firstName: user.firstName,
      username: user.username,
      photoUrl: user.photoUrl,
      role,
      realRole,
      adminRoleLabel: adminAccess.roleLabel,
      adminPermissions: adminAccess.permissions,
      membershipStatus,
      membershipExpiresAt: membershipProfile.membershipExpiresAt,
      paymentType: membershipProfile.paymentType,
      recurrentPaymentStatus: membershipProfile.recurrentPaymentStatus,
      nextPaymentAt: membershipProfile.nextPaymentAt,
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
  .post("/device", async (c) => {
    const body = deviceDiagnosticsSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Invalid device diagnostics" }, 400);
    }

    const now = new Date();
    const [updatedUser] = await db
      .update(users)
      .set({
        deviceSnapshot: body.data,
        deviceSnapshotAt: now,
        updatedAt: now
      })
      .where(eq(users.id, c.get("userId")))
      .returning();

    if (!updatedUser) {
      return c.json({ error: "Unable to update device diagnostics" }, 500);
    }

    return c.json({ ok: true, device: body.data });
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
