import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { createHash, randomUUID } from "node:crypto";
import { deviceDiagnosticsSchema, isValidDisplayName, normalizeDisplayName } from "@club/shared";
import type { AuthVariables } from "../middleware/auth";
import { telegramAuth } from "../middleware/auth";
import { db } from "../db/client";
import { userDevices, userRecurrentSubscriptions, users } from "../db/schema";
import { getAdminAccessProfile, getUserRole } from "../admin/roles";
import { getMembership } from "../membership/getMembership";
import { resolveMembershipProfileFields } from "../membership/profileFields";
import { logger } from "../logger";
import { normalizeAvatarDisplay } from "../profile/avatarDisplay";
import { buildAvatarObjectKey, getAvatarUploadContentType, getAvatarUploadLimitError } from "../profile/avatarUpload";
import { activateReferralRewards, getReferralRewardDays, getReferralSummary } from "../referrals/referrals";
import { optimizeImageForUpload } from "../storage/imageOptimizer";
import { saveLocalUpload } from "../storage/localUploads";
import { getObjectReadUrl, uploadObject } from "../storage/s3";

const avatarRefreshCooldownMs = 7 * 24 * 60 * 60 * 1000;

async function resolveUserPhotoUrl(user: typeof users.$inferSelect) {
  if (!user.avatarObjectKey) {
    return user.photoUrl;
  }

  try {
    return await getObjectReadUrl(user.avatarObjectKey);
  } catch (error) {
    logger.warn({ error, userId: user.id, avatarObjectKey: user.avatarObjectKey }, "Failed to build avatar read URL");
    return user.photoUrl;
  }
}

async function storeAvatarObject({
  key,
  body,
  contentType
}: {
  key: string;
  body: Uint8Array;
  contentType: string;
}) {
  try {
    const s3Upload = await uploadObject({ key, body, contentType });
    return {
      avatarObjectKey: s3Upload.key,
      photoUrl: s3Upload.url
    };
  } catch (error) {
    logger.warn({ error, key }, "S3 avatar upload failed, saving avatar locally");
    const localUpload = await saveLocalUpload({ key, body });
    return {
      avatarObjectKey: null,
      photoUrl: localUpload.url
    };
  }
}

async function buildMeResponse(user: typeof users.$inferSelect, c: { get: <T extends keyof AuthVariables>(key: T) => AuthVariables[T] }) {
  const membership = await getMembership(user.id);
  const photoUrl = await resolveUserPhotoUrl(user);
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
      email: user.email,
      firstName: user.firstName,
      username: user.username,
      displayName: user.displayName,
      displayNameChangedByUserAt: user.displayNameChangedByUserAt?.toISOString() ?? null,
      photoUrl,
      role,
      realRole,
      adminRoleLabel: adminAccess.roleLabel,
      adminPermissions: adminAccess.permissions,
      membershipStatus,
      membershipExpiresAt: membershipProfile.membershipExpiresAt,
      paymentType: membershipProfile.paymentType,
      recurrentPaymentStatus: membershipProfile.recurrentPaymentStatus,
      nextPaymentAt: membershipProfile.nextPaymentAt,
      avatarPositionX: user.avatarPositionX ?? 50,
      avatarPositionY: user.avatarPositionY ?? 50,
      avatarScale: (user.avatarScale ?? 100) / 100,
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
  .get("/referrals", async (c) => {
    const [referral, referralRewardDays] = await Promise.all([
      getReferralSummary(c.get("userId")),
      getReferralRewardDays()
    ]);

    return c.json({ referral, settings: { referralRewardDays } });
  })
  .post("/referrals/activate", async (c) => {
    const result = await activateReferralRewards(c.get("userId"));
    if (!result.ok) {
      return c.json({ error: result.error }, 409);
    }

    return c.json(result);
  })
  .post("/device", async (c) => {
    const body = deviceDiagnosticsSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Invalid device diagnostics" }, 400);
    }

    const now = new Date();
    const installationId =
      body.data.installationId ??
      `legacy-${createHash("sha256")
        .update(JSON.stringify([body.data.userAgent, body.data.screen.width, body.data.screen.height, body.data.screen.pixelRatio]))
        .digest("hex")
        .slice(0, 48)}`;
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

    await db
      .insert(userDevices)
      .values({
        userId: c.get("userId"),
        installationId,
        diagnostics: body.data,
        firstSeenAt: now,
        lastSeenAt: now
      })
      .onConflictDoUpdate({
        target: [userDevices.userId, userDevices.installationId],
        set: {
          diagnostics: body.data,
          lastSeenAt: now
        }
      });

    return c.json({ ok: true, device: body.data });
  })
  .patch("/display-name", async (c) => {
    const raw = (await c.req.json().catch(() => null)) as { displayName?: unknown } | null;
    if (typeof raw?.displayName !== "string" || !isValidDisplayName(raw.displayName)) {
      return c.json({ error: "Invalid display name" }, 400);
    }
    const user = await db.query.users.findFirst({ where: eq(users.id, c.get("userId")) });
    if (!user) return c.json({ error: "User not found" }, 404);
    if (user.displayNameChangedByUserAt) return c.json({ error: "Display name change already used" }, 403);
    const now = new Date();
    try {
      const [updatedUser] = await db.update(users).set({
        displayName: normalizeDisplayName(raw.displayName),
        displayNameChangedByUserAt: now,
        updatedAt: now
      }).where(eq(users.id, user.id)).returning();
      if (!updatedUser) return c.json({ error: "Unable to update display name" }, 500);
      return c.json(await buildMeResponse(updatedUser, c));
    } catch (error) {
      if ((error as { code?: string })?.code === "23505") return c.json({ error: "Display name is already taken" }, 409);
      throw error;
    }
  })
  .post("/avatar/upload", async (c) => {
    const userId = c.get("userId");
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId)
    });

    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    const formData = await c.req.formData().catch(() => null);
    const avatar = formData?.get("avatar");
    if (!(avatar instanceof File)) {
      return c.json({ error: "Avatar file is required" }, 400);
    }

    const limitError = getAvatarUploadLimitError(avatar);
    if (limitError === "empty_file") {
      return c.json({ error: "Avatar file is empty" }, 400);
    }
    if (limitError === "file_too_large") {
      return c.json({ error: "Avatar file is too large" }, 413);
    }

    const sourceContentType = getAvatarUploadContentType(avatar.type, avatar.name);
    if (!sourceContentType) {
      return c.json({ error: "Unsupported avatar file type" }, 400);
    }

    const sourceBytes = new Uint8Array(await avatar.arrayBuffer());
    const optimizedAvatar = await optimizeImageForUpload({
      bytes: sourceBytes,
      contentType: sourceContentType,
      fileName: avatar.name || "avatar",
      maxDimension: 512
    });
    const now = new Date();
    const avatarKey = buildAvatarObjectKey({
      userId: user.id,
      fileName: optimizedAvatar.fileName,
      id: randomUUID(),
      now
    });
    const storedAvatar = await storeAvatarObject({
      key: avatarKey,
      body: optimizedAvatar.body,
      contentType: optimizedAvatar.contentType
    });

    const [updatedUser] = await db
      .update(users)
      .set({
        avatarObjectKey: storedAvatar.avatarObjectKey,
        photoUrl: storedAvatar.photoUrl ?? user.photoUrl,
        avatarPositionX: 50,
        avatarPositionY: 50,
        avatarScale: 100,
        avatarRefreshedAt: now,
        updatedAt: now
      })
      .where(eq(users.id, userId))
      .returning();

    if (!updatedUser) {
      return c.json({ error: "Unable to update avatar" }, 500);
    }

    return c.json(await buildMeResponse(updatedUser, c));
  })
  .patch("/avatar/display", async (c) => {
    const userId = c.get("userId");
    const display = normalizeAvatarDisplay(await c.req.json().catch(() => null));
    const now = new Date();
    const [updatedUser] = await db
      .update(users)
      .set({
        avatarPositionX: Math.round(display.avatarPositionX),
        avatarPositionY: Math.round(display.avatarPositionY),
        avatarScale: Math.round(display.avatarScale * 100),
        updatedAt: now
      })
      .where(eq(users.id, userId))
      .returning();

    if (!updatedUser) {
      return c.json({ error: "Unable to update avatar display" }, 500);
    }

    return c.json(await buildMeResponse(updatedUser, c));
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
        avatarObjectKey: null,
        avatarPositionX: 50,
        avatarPositionY: 50,
        avatarScale: 100,
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
