import { randomBytes } from "node:crypto";
import { and, count, desc, eq } from "drizzle-orm";
import type { AdminUserReferrals, ReferralSummary } from "@club/shared";
import { db } from "../db/client";
import {
  appNotifications,
  clubSettings,
  paymentOrders,
  referralCodes,
  referralRewards,
  referrals,
  subscriptions,
  userRecurrentSubscriptions,
  users,
  type PaymentOrder,
  type User
} from "../db/schema";
import { env } from "../env";
import { logger } from "../logger";
import { getMembership } from "../membership/getMembership";
import { sendTelegramMessage } from "../telegram/client";
import { canActivateReferralRewards, normalizeReferralRewardDays, parseReferralStartParam } from "./rules";

export const referralRewardDaysSettingKey = "referral_reward_days";

function createReferralCode() {
  return randomBytes(8).toString("base64url").slice(0, 10);
}

function getBotUsername() {
  return (env.TELEGRAM_BOT_USERNAME ?? "tehnobot_club_bot").replace(/^@/, "");
}

function buildReferralLink(code: string) {
  return `https://t.me/${getBotUsername()}?start=ref_${code}`;
}

function displayUser(user: Pick<User, "firstName" | "username" | "telegramId">) {
  return user.firstName || (user.username ? `@${user.username}` : `ID ${user.telegramId}`);
}

async function notifyUser({
  user,
  title,
  body,
  sourceId,
  kind = "system"
}: {
  user: Pick<User, "id" | "telegramId">;
  title: string;
  body: string;
  sourceId?: string;
  kind?: "system" | "payment";
}) {
  await db
    .insert(appNotifications)
    .values({
      userId: user.id,
      kind,
      title,
      body,
      source: "referral",
      sourceId: sourceId ?? null
    })
    .catch((error) => {
      logger.warn({ error, userId: user.id }, "referral app notification failed");
    });

  await sendTelegramMessage({
    chatId: user.telegramId,
    text: `${title}\n${body}`,
    replyMarkup: {
      inline_keyboard: [
        [
          {
            text: "Открыть клуб",
            web_app: {
              url: env.WEB_ORIGIN
            }
          }
        ]
      ]
    }
  }).catch((error) => {
    logger.warn({ error, telegramId: user.telegramId }, "referral telegram notification failed");
  });
}

export async function getReferralRewardDays() {
  const setting = await db.query.clubSettings.findFirst({
    where: eq(clubSettings.key, referralRewardDaysSettingKey)
  });

  return normalizeReferralRewardDays(setting?.value);
}

export async function updateReferralRewardDays(value: number, updatedByUserId: string) {
  const rewardDays = normalizeReferralRewardDays(value);
  const now = new Date();

  await db
    .insert(clubSettings)
    .values({
      key: referralRewardDaysSettingKey,
      value: String(rewardDays),
      updatedByUserId,
      updatedAt: now
    })
    .onConflictDoUpdate({
      target: clubSettings.key,
      set: {
        value: String(rewardDays),
        updatedByUserId,
        updatedAt: now
      }
    });

  return rewardDays;
}

export async function getOrCreateReferralCode(userId: string) {
  const existing = await db.query.referralCodes.findFirst({
    where: eq(referralCodes.userId, userId)
  });
  if (existing) {
    return existing;
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const now = new Date();
    const [created] = await db
      .insert(referralCodes)
      .values({
        userId,
        code: createReferralCode(),
        createdAt: now,
        updatedAt: now
      })
      .onConflictDoNothing()
      .returning();

    if (created) {
      return created;
    }

    const concurrent = await db.query.referralCodes.findFirst({
      where: eq(referralCodes.userId, userId)
    });
    if (concurrent) {
      return concurrent;
    }
  }

  throw new Error("Unable to create referral code");
}

export async function captureReferralFromStartParam(invitedUser: User, startParam: string | null | undefined) {
  const code = parseReferralStartParam(startParam);
  if (!code) {
    return null;
  }

  const sourceCode = await db.query.referralCodes.findFirst({
    where: eq(referralCodes.code, code),
    with: { user: true }
  });
  if (!sourceCode || sourceCode.userId === invitedUser.id || !sourceCode.user) {
    return null;
  }

  const existing = await db.query.referrals.findFirst({
    where: eq(referrals.invitedUserId, invitedUser.id)
  });
  if (existing) {
    return existing;
  }

  const now = new Date();
  const [created] = await db
    .insert(referrals)
    .values({
      inviterUserId: sourceCode.userId,
      invitedUserId: invitedUser.id,
      code,
      invitedAt: now,
      createdAt: now,
      updatedAt: now
    })
    .onConflictDoNothing()
    .returning();

  if (created) {
    await notifyUser({
      user: sourceCode.user,
      title: "Новый переход по вашей ссылке",
      body: `${displayUser(invitedUser)} открыл клуб по вашей реферальной ссылке.`,
      sourceId: created.id
    });
  }

  return created ?? null;
}

async function getRecurrentPaymentStatus(userId: string) {
  const subscription = await db.query.userRecurrentSubscriptions.findFirst({
    where: eq(userRecurrentSubscriptions.userId, userId),
    orderBy: [desc(userRecurrentSubscriptions.updatedAt)]
  });

  return subscription?.status ?? null;
}

export async function getReferralSummary(userId: string): Promise<ReferralSummary> {
  const [code, invited, rewards, membership, recurrentPaymentStatus] = await Promise.all([
    getOrCreateReferralCode(userId),
    db.query.referrals.findMany({
      where: eq(referrals.inviterUserId, userId)
    }),
    db.query.referralRewards.findMany({
      where: eq(referralRewards.inviterUserId, userId)
    }),
    getMembership(userId),
    getRecurrentPaymentStatus(userId)
  ]);

  const availableDays = rewards
    .filter((reward) => reward.status === "available")
    .reduce((total, reward) => total + reward.bonusDays, 0);
  const paidCount = invited.filter((item) => item.firstPaidAt).length;
  const activation = canActivateReferralRewards({
    isActiveMembership: membership.isActive,
    subscriptionProvider: membership.subscription?.provider ?? null,
    recurrentPaymentStatus
  });
  const activationBlockedReason =
    availableDays <= 0 ? "no_available_days" : activation.allowed ? null : activation.reason;

  return {
    code: code.code,
    link: buildReferralLink(code.code),
    availableDays,
    invitedCount: invited.length,
    paidCount,
    canActivate: availableDays > 0 && activation.allowed,
    activationBlockedReason
  };
}

export async function activateReferralRewards(userId: string) {
  const [availableRewards, membership, recurrentPaymentStatus] = await Promise.all([
    db.query.referralRewards.findMany({
      where: and(eq(referralRewards.inviterUserId, userId), eq(referralRewards.status, "available"))
    }),
    getMembership(userId),
    getRecurrentPaymentStatus(userId)
  ]);
  const activation = canActivateReferralRewards({
    isActiveMembership: membership.isActive,
    subscriptionProvider: membership.subscription?.provider ?? null,
    recurrentPaymentStatus
  });
  if (!activation.allowed) {
    return {
      ok: false as const,
      status: 409,
      error: activation.reason
    };
  }

  const activatedDays = availableRewards.reduce((total, reward) => total + reward.bonusDays, 0);
  if (activatedDays <= 0) {
    return {
      ok: true as const,
      activatedDays: 0,
      membershipExpiresAt: membership.subscription?.expiresAt?.toISOString() ?? null,
      referral: await getReferralSummary(userId)
    };
  }

  const now = new Date();
  const activeUntil =
    membership.isActive && membership.subscription?.expiresAt && membership.subscription.expiresAt.getTime() > now.getTime()
      ? membership.subscription.expiresAt
      : now;
  const expiresAt = new Date(activeUntil.getTime() + activatedDays * 24 * 60 * 60 * 1000);

  await db.transaction(async (tx) => {
    await tx.insert(subscriptions).values({
      userId,
      status: "active",
      provider: "referral_bonus",
      providerPaymentId: null,
      expiresAt,
      createdAt: now,
      updatedAt: now
    });

    await tx
      .update(referralRewards)
      .set({
        status: "activated",
        activatedAt: now,
        updatedAt: now
      })
      .where(and(eq(referralRewards.inviterUserId, userId), eq(referralRewards.status, "available")));
  });

  await notifyUser({
    user: { id: userId, telegramId: (await db.query.users.findFirst({ where: eq(users.id, userId) }))?.telegramId ?? userId },
    title: "Реферальные дни активированы",
    body: `Добавлено ${activatedDays} дн. доступа.`,
    kind: "system"
  });

  return {
    ok: true as const,
    activatedDays,
    membershipExpiresAt: expiresAt.toISOString(),
    referral: await getReferralSummary(userId)
  };
}

export async function awardReferralRewardForFirstPayment(order: PaymentOrder, paidUser: User) {
  const [paidOrdersResult] = await db
    .select({ value: count() })
    .from(paymentOrders)
    .where(and(eq(paymentOrders.userId, paidUser.id), eq(paymentOrders.status, "paid")));
  const paidOrdersCount = paidOrdersResult?.value ?? 0;

  if (paidOrdersCount !== 1) {
    return null;
  }

  const referral = await db.query.referrals.findFirst({
    where: eq(referrals.invitedUserId, paidUser.id),
    with: {
      inviter: true,
      rewards: true
    }
  });
  if (!referral || referral.firstPaidAt || referral.rewards.length > 0 || !referral.inviter) {
    return null;
  }

  const now = new Date();
  const bonusDays = await getReferralRewardDays();
  await db.update(referrals).set({ firstPaidAt: now, updatedAt: now }).where(eq(referrals.id, referral.id));
  const [reward] = await db
    .insert(referralRewards)
    .values({
      referralId: referral.id,
      inviterUserId: referral.inviterUserId,
      invitedUserId: paidUser.id,
      paymentOrderId: order.id,
      bonusDays,
      status: "available",
      createdAt: now,
      updatedAt: now
    })
    .onConflictDoNothing()
    .returning();

  if (reward) {
    await notifyUser({
      user: referral.inviter,
      title: "Реферал оплатил клуб",
      body: `${displayUser(paidUser)} совершил первую оплату. Вам начислено ${bonusDays} дн., их можно активировать в профиле.`,
      sourceId: referral.id,
      kind: "payment"
    });
  }

  return reward ?? null;
}

function mapReferralUser(user: Pick<User, "telegramId" | "firstName" | "username" | "photoUrl">) {
  return {
    telegramId: user.telegramId,
    firstName: user.firstName,
    username: user.username,
    photoUrl: user.photoUrl
  };
}

export async function getAdminUserReferrals(userId: string): Promise<AdminUserReferrals> {
  const [invitedBy, invited] = await Promise.all([
    db.query.referrals.findFirst({
      where: eq(referrals.invitedUserId, userId),
      with: {
        inviter: true
      }
    }),
    db.query.referrals.findMany({
      where: eq(referrals.inviterUserId, userId),
      with: {
        invited: true,
        rewards: true
      },
      orderBy: [desc(referrals.createdAt)]
    })
  ]);

  return {
    invitedBy:
      invitedBy && invitedBy.inviter
        ? {
            id: invitedBy.id,
            invitedAt: invitedBy.invitedAt.toISOString(),
            firstPaidAt: invitedBy.firstPaidAt?.toISOString() ?? null,
            inviterUser: mapReferralUser(invitedBy.inviter)
          }
        : null,
    invited: invited
      .filter((item) => item.invited)
      .map((item) => {
        const reward = item.rewards[0] ?? null;
        const status = reward?.status === "available" || reward?.status === "activated" ? reward.status : "none";

        return {
          id: item.id,
          invitedAt: item.invitedAt.toISOString(),
          firstPaidAt: item.firstPaidAt?.toISOString() ?? null,
          rewardDays: reward?.bonusDays ?? 0,
          rewardStatus: status,
          invitedUser: mapReferralUser(item.invited!)
        };
      })
  };
}
