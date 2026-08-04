import { and, count, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import type { UserRole } from "@club/shared";
import { getAdminAccessProfile } from "../admin/roles";
import { db } from "../db/client";
import { appNotifications } from "../db/schema";
import { getMembership } from "../membership/getMembership";
import { resolveCurrentAccess } from "../membership/currentAccess";
import { loadCurrentAccessSourceData } from "../membership/currentAccessData";
import { resolveMembershipPreview, resolveMembershipProfileFields } from "../membership/profileFields";
import type { AuthVariables } from "../middleware/auth";
import { telegramAuth } from "../middleware/auth";
import { getSupportUnreadCount } from "../support/unreadCount";

export const appStateRoute = new Hono<{ Variables: AuthVariables }>()
  .use("*", telegramAuth)
  .get("/", async (c) => {
    const user = c.get("currentUser");
    const [membership, adminAccess, notificationRow] = await Promise.all([
      getMembership(user.id),
      getAdminAccessProfile(user.telegramId),
      db
        .select({ value: count(appNotifications.id) })
        .from(appNotifications)
        .where(and(eq(appNotifications.userId, user.id), isNull(appNotifications.readAt)))
        .then((rows) => rows[0])
    ]);

    const realRole: UserRole = adminAccess.isOwner ? "owner" : adminAccess.isActive ? "admin" : "member";
    const role = c.get("previewRole") ?? realRole;
    const isSupportAdmin = role === "owner" || (role === "admin" && adminAccess.permissions.includes("support"));
    const [accessSource, supportUnreadCount] = await Promise.all([
      loadCurrentAccessSourceData({
        userId: user.id,
        provider: membership.subscription?.provider ?? null,
        providerPaymentId: membership.subscription?.providerPaymentId ?? null
      }),
      getSupportUnreadCount({ userId: user.id, isSupportAdmin })
    ]);

    const membershipPreview = resolveMembershipPreview({
      actualStatus: membership.status,
      actualExpiresAt: membership.subscription?.expiresAt ?? null,
      previewStatus: c.get("previewMembershipStatus")
    });
    const membershipProfile = resolveMembershipProfileFields({
      membershipStatus: membershipPreview.membershipStatus,
      subscriptionProvider: membership.subscription?.provider ?? null,
      subscriptionExpiresAt: membershipPreview.membershipExpiresAt,
      recurrentPaymentStatus: accessSource.recurrentPaymentStatus
    });
    const currentAccess = resolveCurrentAccess({
      membershipStatus: membershipPreview.membershipStatus,
      provider: membership.subscription?.provider ?? null,
      expiresAt: membershipPreview.membershipExpiresAt,
      nextPaymentAt: membershipProfile.nextPaymentAt ? new Date(membershipProfile.nextPaymentAt) : null,
      product: accessSource.product,
      bonusDays: accessSource.bonusDays
    });

    return c.json({
      access: {
        role,
        realRole,
        adminRoleLabel: adminAccess.roleLabel,
        adminPermissions: adminAccess.permissions,
        membershipStatus: membershipPreview.membershipStatus,
        membershipExpiresAt: membershipProfile.membershipExpiresAt,
        paymentType: membershipProfile.paymentType,
        recurrentPaymentStatus: membershipProfile.recurrentPaymentStatus,
        nextPaymentAt: membershipProfile.nextPaymentAt,
        currentAccess
      },
      notificationUnreadCount: notificationRow?.value ?? 0,
      supportUnreadCount
    });
  });
