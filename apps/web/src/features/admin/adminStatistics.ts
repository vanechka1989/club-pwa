import type { AdminLearningMaterial, AdminStatsUser, ClubTopic, ContentKind, LearningCategory, PaymentOrderLog } from "@club/shared";
import type { AdminPaymentBreakdownItem } from "./adminPaymentDrilldown";
import type { AdminAccessBreakdownItem } from "./adminUserDrilldown";

export type AdminStatisticsPeriod = "7d" | "30d" | "all";

export type AdminStatisticsInput = {
  users: AdminStatsUser[];
  paymentOrders: PaymentOrderLog[];
  learningCategories: LearningCategory[];
  learningMaterials: AdminLearningMaterial[];
  communityTopics: ClubTopic[];
};

export type AdminStatisticsOptions = {
  period: AdminStatisticsPeriod;
  now?: Date;
};

const contentKindLabels: Record<ContentKind, string> = {
  text: "Текст",
  photo: "Фото",
  video: "Видео",
  audio: "Аудио"
};

const tariffLabels: Record<string, string> = {
  prodamus_recurrent: "Рекуррент Prodamus",
  prodamus: "Разовый Prodamus",
  manual: "Ручной доступ",
  future: "Без тарифа"
};

function percent(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

function periodStart(period: AdminStatisticsPeriod, now: Date) {
  if (period === "all") {
    return null;
  }

  const days = period === "7d" ? 7 : 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function isInPeriod(dateString: string | null, period: AdminStatisticsPeriod, now: Date) {
  const start = periodStart(period, now);
  if (!start || !dateString) {
    return true;
  }

  const date = new Date(dateString);
  return date >= start && date <= now;
}

function orderDate(order: PaymentOrderLog) {
  return order.paidAt ?? order.createdAt;
}

function isArchived(material: AdminLearningMaterial) {
  return Boolean(material.archivedUntil);
}

function tariffLabel(tariff: string | null) {
  return tariffLabels[tariff || "future"] ?? tariff ?? "Без тарифа";
}

function buildContentKindStats(materials: AdminLearningMaterial[]) {
  const order: ContentKind[] = ["text", "photo", "video", "audio"];
  return order.map((kind) => ({
    kind,
    label: contentKindLabels[kind],
    count: materials.filter((material) => material.kind === kind).length
  }));
}

function buildTariffStats(users: AdminStatsUser[]) {
  const counts = new Map<string, number>();
  users.forEach((user) => {
    const key = user.tariff || "future";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([tariff, value]) => ({
      tariff,
      label: tariffLabel(tariff),
      value,
      percent: percent(value, users.length)
    }))
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label, "ru"));
}

function buildPopularTitle(users: AdminStatsUser[]) {
  const counts = new Map<string, number>();
  users.forEach((user) => {
    if (!user.lastOpenedItemTitle) {
      return;
    }

    counts.set(user.lastOpenedItemTitle, (counts.get(user.lastOpenedItemTitle) ?? 0) + 1);
  });

  return Array.from(counts.entries()).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "ru"))[0]?.[0] ?? null;
}

export function buildAdminStatistics(input: AdminStatisticsInput, options: AdminStatisticsOptions) {
  const now = options.now ?? new Date();
  const activeUsers = input.users.filter((user) => user.membershipStatus === "active");
  const inactiveUsers = input.users.filter((user) => user.membershipStatus !== "active");
  const newUsers = input.users.filter((user) => isInPeriod(user.createdAt, options.period, now));
  const expiringSoon = activeUsers.filter((user) => {
    if (!user.membershipExpiresAt) {
      return false;
    }

    const expiresAt = new Date(user.membershipExpiresAt);
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return expiresAt >= now && expiresAt <= sevenDaysFromNow;
  });
  const periodOrders = input.paymentOrders.filter((order) => isInPeriod(orderDate(order), options.period, now));
  const paidOrders = periodOrders.filter((order) => order.status === "paid");
  const pendingOrders = periodOrders.filter((order) => order.status === "pending").length;
  const failedOrders = periodOrders.filter((order) => order.status === "failed").length;
  const failedWebhookOrders = periodOrders.filter((order) => order.webhook && !order.webhook.isValid).length;
  const oneTimePaidOrders = paidOrders.filter((order) => order.productKind === "one_time").length;
  const recurrentPaidOrders = paidOrders.filter((order) => order.productKind === "recurrent").length;
  const revenueRub = paidOrders.reduce((sum, order) => sum + order.amountRub, 0);
  const completedItems = input.users.reduce((sum, user) => sum + user.completedItems, 0);
  const totalItems = input.users.reduce((sum, user) => sum + user.totalItems, 0);
  const publishedMaterials = input.learningMaterials.filter((material) => material.isPublished && !isArchived(material));
  const hiddenMaterials = input.learningMaterials.filter((material) => !material.isPublished && !isArchived(material));
  const archivedMaterials = input.learningMaterials.filter(isArchived);
  const openTopics = input.communityTopics.filter((topic) => topic.isPublished && !topic.isLocked && !topic.archivedUntil);
  const lockedTopics = input.communityTopics.filter((topic) => topic.isLocked);

  return {
    clients: {
      total: input.users.length,
      active: activeUsers.length,
      inactive: inactiveUsers.length,
      restricted: input.users.filter((user) => user.hasRestrictions).length,
      expiringSoon: expiringSoon.length,
      newInPeriod: newUsers.length,
      activePercent: percent(activeUsers.length, input.users.length),
      accessBreakdown: [
        { key: "inactive", label: "Без доступа", value: inactiveUsers.length },
        { key: "restricted", label: "Ограничения", value: input.users.filter((user) => user.hasRestrictions).length },
        { key: "expiring_soon", label: "Истекают скоро", value: expiringSoon.length }
      ] satisfies AdminAccessBreakdownItem[]
    },
    payments: {
      paidOrders: paidOrders.length,
      pendingOrders,
      failedOrders,
      failedWebhookOrders,
      revenueRub,
      averagePaidOrderRub: paidOrders.length > 0 ? Math.round(revenueRub / paidOrders.length) : 0,
      oneTimePaidOrders,
      recurrentPaidOrders,
      breakdown: [
        { key: "paid", label: "Всего оплат", value: paidOrders.length },
        { key: "one_time", label: "Разовые", value: oneTimePaidOrders },
        { key: "recurrent", label: "Рекуррент", value: recurrentPaidOrders },
        { key: "pending", label: "Ожидают", value: pendingOrders },
        { key: "webhook_failed", label: "Ошибки webhook", value: failedWebhookOrders },
        { key: "failed", label: "Ошибки оплат", value: failedOrders }
      ] satisfies AdminPaymentBreakdownItem[]
    },
    learning: {
      categoriesCount: input.learningCategories.length,
      publishedMaterials: publishedMaterials.length,
      hiddenMaterials: hiddenMaterials.length,
      archivedMaterials: archivedMaterials.length,
      averageProgressPercent: percent(completedItems, totalItems),
      completedItems,
      totalItems,
      popularTitle: buildPopularTitle(input.users)
    },
    communication: {
      topics: input.communityTopics.length,
      openTopics: openTopics.length,
      lockedTopics: lockedTopics.length,
      archivedTopics: input.communityTopics.filter((topic) => topic.archivedUntil).length,
      messages: input.communityTopics.reduce((sum, topic) => sum + topic.messagesCount, 0)
    },
    tariffs: buildTariffStats(input.users),
    contentKinds: buildContentKindStats(input.learningMaterials)
  };
}
