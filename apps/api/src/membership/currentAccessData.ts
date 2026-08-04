import { and, desc, eq } from "drizzle-orm";
import type { PaymentProductKind } from "@club/shared";
import { db } from "../db/client";
import { paymentOrders, referralRewards, userRecurrentSubscriptions } from "../db/schema";
import { resolvePaymentOrderSnapshot } from "../payments/paymentOrderSnapshot";

type AccessProduct = {
  title: string;
  kind: PaymentProductKind;
  accessDays: number;
};

export type CurrentAccessSourceData = {
  product: AccessProduct | null;
  bonusDays: number | null;
  recurrentPaymentStatus: "active" | "cancelled" | null;
};

export async function loadCurrentAccessSourceData({
  userId,
  provider,
  providerPaymentId
}: {
  userId: string;
  provider: string | null;
  providerPaymentId: string | null;
}): Promise<CurrentAccessSourceData> {
  if (provider === "referral_bonus") {
    const rewards = await db.query.referralRewards.findMany({
      where: and(eq(referralRewards.inviterUserId, userId), eq(referralRewards.status, "activated")),
      orderBy: [desc(referralRewards.activatedAt)],
      limit: 50
    });
    const latestActivation = rewards[0]?.activatedAt?.getTime() ?? null;
    const bonusDays = latestActivation === null
      ? null
      : rewards
          .filter((reward) => reward.activatedAt?.getTime() === latestActivation)
          .reduce((total, reward) => total + reward.bonusDays, 0);
    return { product: null, bonusDays: bonusDays && bonusDays > 0 ? bonusDays : null, recurrentPaymentStatus: null };
  }

  if (provider === "prodamus_recurrent" || provider === "lava_recurrent") {
    const subscription = await db.query.userRecurrentSubscriptions.findFirst({
      where: eq(userRecurrentSubscriptions.userId, userId),
      with: { product: true, individualOffer: true },
      orderBy: [desc(userRecurrentSubscriptions.updatedAt)]
    });
    const source = subscription?.product ?? subscription?.individualOffer ?? null;
    return {
      product: source ? { title: source.title, kind: source.kind, accessDays: source.accessDays } : null,
      bonusDays: null,
      recurrentPaymentStatus: subscription?.status ?? null
    };
  }

  if (provider === "prodamus" || provider === "lava") {
    const orders = await db.query.paymentOrders.findMany({
      where: and(eq(paymentOrders.userId, userId), eq(paymentOrders.status, "paid")),
      with: { product: true },
      orderBy: [desc(paymentOrders.paidAt), desc(paymentOrders.createdAt)],
      limit: 20
    });
    const order = orders.find((entry) =>
      providerPaymentId && (entry.providerPaymentId === providerPaymentId || entry.providerOrderId === providerPaymentId)
    ) ?? orders[0] ?? null;
    if (!order) {
      return { product: null, bonusDays: null, recurrentPaymentStatus: null };
    }
    const snapshot = resolvePaymentOrderSnapshot(order);
    return {
      product: { title: snapshot.title, kind: snapshot.kind, accessDays: snapshot.accessDays },
      bonusDays: null,
      recurrentPaymentStatus: null
    };
  }

  return { product: null, bonusDays: null, recurrentPaymentStatus: null };
}
