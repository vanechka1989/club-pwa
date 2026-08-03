import type {
  AdminAcquisitionDashboard,
  AdminFinanceAnalyticsResponse,
  AdminStatsResponse,
  AdminStatsUser,
  LearningEngagementResponse,
  PaymentOrderLog
} from "@club/shared";
import type { AdminStatistics } from "./adminStatistics";

type DateRange = { from: string; to: string };

function randomFactory(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function integer(random: () => number, min: number, max: number) {
  return Math.floor(random() * (max - min + 1)) + min;
}

function percent(value: number, total: number) {
  return total ? Math.round((value / total) * 1000) / 10 : 0;
}

function dateKeys(range: DateRange) {
  const values: string[] = [];
  const cursor = new Date(`${range.from}T00:00:00.000Z`);
  const end = new Date(`${range.to}T00:00:00.000Z`);
  while (cursor <= end && values.length < 366) {
    values.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return values.length ? values : [new Date().toISOString().slice(0, 10)];
}

function uuid(index: number) {
  return `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

export function createShowcaseAnalytics(seed: number, range: DateRange): {
  stats: AdminStatsResponse;
  finance: AdminFinanceAnalyticsResponse;
  acquisition: AdminAcquisitionDashboard;
  learning: LearningEngagementResponse;
  overview: AdminStatistics;
  paymentOrders: PaymentOrderLog[];
} {
  const random = randomFactory(seed);
  const dates = dateKeys(range);
  const userCount = integer(random, 34, 92);
  const activeCount = integer(random, Math.ceil(userCount * 0.48), Math.ceil(userCount * 0.82));
  const lessonCount = integer(random, 6, 14);
  const names = ["Анна", "Мария", "Елена", "Алексей", "Ольга", "Ирина", "Дмитрий", "Наталья", "Сергей", "Виктория"];
  const tariffs = ["prodamus_recurrent", "prodamus", "lava_recurrent", "lava", "manual", null] as const;
  const users: AdminStatsUser[] = Array.from({ length: userCount }, (_, index) => {
    const active = index < activeCount;
    const createdDate = dates[integer(random, 0, dates.length - 1)]!;
    const completedItems = integer(random, 0, lessonCount);
    return {
      id: uuid(index + 1),
      telegramId: `demo-${seed}-${index + 1}`,
      email: null,
      phone: null,
      phoneSource: null,
      phoneUpdatedAt: null,
      personalDataRestricted: false,
      marketingEmailOptOutAt: null,
      firstName: `${names[index % names.length]} ${index + 1}`,
      username: null,
      displayName: null,
      displayNameChangedByUserAt: null,
      photoUrl: null,
      role: "member",
      membershipStatus: active ? "active" : "inactive",
      membershipExpiresAt: active ? `${range.to}T12:00:00.000Z` : null,
      tariff: active ? (tariffs[integer(random, 0, tariffs.length - 2)] ?? null) : null,
      paymentProductIds: [],
      paymentProviders: [],
      recurrentPaymentStatus: active && random() > 0.5 ? "active" : null,
      hasRestrictions: random() < 0.08,
      completedItems,
      totalItems: lessonCount,
      lastOpenedItemTitle: `Материал ${integer(random, 1, lessonCount)}`,
      lastOpenedAt: `${createdDate}T12:00:00.000Z`,
      lastLoginAt: `${createdDate}T12:00:00.000Z`,
      telegramBotStatus: "active",
      telegramBotBlockedAt: null,
      telegramBotUnblockedAt: null,
      acquisition: null,
      createdAt: `${createdDate}T09:00:00.000Z`
    };
  });

  const providerRevenue = {
    prodamus: integer(random, 90, 260) * 1000,
    lava: integer(random, 45, 180) * 1000
  };
  const revenueRub = providerRevenue.prodamus + providerRevenue.lava;
  const providerPaid = { prodamus: integer(random, 18, 48), lava: integer(random, 9, 31) };
  const paidOrders = providerPaid.prodamus + providerPaid.lava;
  const attempts = paidOrders + integer(random, 4, 17);
  const providerRows = (["prodamus", "lava"] as const).map((provider) => ({
    provider,
    title: provider === "prodamus" ? "Prodamus" : "Lava",
    attempts: providerPaid[provider] + integer(random, 1, 8),
    paidOrders: providerPaid[provider],
    uniqueCustomers: Math.min(providerPaid[provider], integer(random, 8, 30)),
    revenueRub: providerRevenue[provider],
    averagePaidOrderRub: Math.round(providerRevenue[provider] / providerPaid[provider]),
    revenuePercent: percent(providerRevenue[provider], revenueRub),
    successPercent: 0
  })).map((row) => ({ ...row, successPercent: percent(row.paidOrders, row.attempts) }));
  const totalPayingCustomers = integer(random, 22, Math.min(userCount, 58));
  const retained = integer(random, Math.ceil(totalPayingCustomers * 0.55), totalPayingCustomers);
  const churned = totalPayingCustomers - retained;
  const finance: AdminFinanceAnalyticsResponse = {
    overview: {
      revenueRub,
      paidOrders,
      totalAttempts: attempts,
      uniqueCustomers: totalPayingCustomers,
      averagePaidOrderRub: Math.round(revenueRub / paidOrders),
      successPercent: percent(paidOrders, attempts)
    },
    providers: providerRows,
    products: [{
      productId: uuid(9001), title: "Основная подписка", kind: "recurrent", paidOrders,
      uniqueCustomers: totalPayingCustomers, revenueRub, averagePaidOrderRub: Math.round(revenueRub / paidOrders), revenuePercent: 100
    }],
    retention: {
      totalPayingCustomers,
      activeCustomers: retained,
      activePercent: percent(retained, totalPayingCustomers),
      churnedCustomers: churned,
      churnedPercent: percent(churned, totalPayingCustomers),
      onePurchaseChurned: Math.floor(churned / 2),
      onePurchaseChurnedPercent: percent(Math.floor(churned / 2), churned),
      repeatPurchaseChurned: Math.ceil(churned / 2),
      repeatPurchaseChurnedPercent: percent(Math.ceil(churned / 2), churned),
      exitStages: [{ renewals: 1, label: "После первого продления", customers: churned, percentOfRepeatChurned: churned ? 100 : 0 }],
      byProviders: providerRows.map((row) => ({ key: row.provider, title: row.title, totalCustomers: row.uniqueCustomers, activeCustomers: Math.min(row.uniqueCustomers, retained), churnedCustomers: Math.max(0, row.uniqueCustomers - retained), churnedPercent: percent(Math.max(0, row.uniqueCustomers - retained), row.uniqueCustomers) })),
      byProducts: []
    }
  };

  const timeline = dates.map((date) => {
    const visits = integer(random, 18, 90);
    const registrations = integer(random, 2, Math.max(2, Math.floor(visits * 0.35)));
    const paidUsers = integer(random, 0, Math.max(1, Math.floor(registrations * 0.45)));
    return { date, visits, registrations, paidUsers, revenueRub: paidUsers * integer(random, 900, 3500) };
  });
  const acquisitionTotals = timeline.reduce((sum, row) => ({ visits: sum.visits + row.visits, registrations: sum.registrations + row.registrations, paidUsers: sum.paidUsers + row.paidUsers, revenueRub: sum.revenueRub + row.revenueRub }), { visits: 0, registrations: 0, paidUsers: 0, revenueRub: 0 });
  const acquisition: AdminAcquisitionDashboard = {
    attribution: "last",
    period: range,
    summary: {
      ...acquisitionTotals,
      uniqueVisitors: Math.round(acquisitionTotals.visits * 0.82),
      visitToRegistrationRate: percent(acquisitionTotals.registrations, acquisitionTotals.visits),
      registrationToPaidRate: percent(acquisitionTotals.paidUsers, acquisitionTotals.registrations),
      visitToPaidRate: percent(acquisitionTotals.paidUsers, acquisitionTotals.visits)
    },
    timeline,
    sources: [{ key: "telegram", label: "Telegram", ...acquisitionTotals, overlapRegistrations: 0 }],
    campaigns: [{ key: "launch", label: "Запуск", ...acquisitionTotals, overlapRegistrations: 0 }],
    topLinks: []
  };

  const cards = Array.from({ length: lessonCount }, (_, index) => {
    const viewers = integer(random, 8, userCount);
    const views = viewers + integer(random, 1, viewers * 2);
    const quickExits = integer(random, 0, Math.floor(views * 0.25));
    return {
      contentItemId: uuid(5000 + index), title: `Материал ${index + 1}`, categoryTitle: index < 3 ? "Старт" : "Практика",
      viewers, views, engagedViews: views - quickExits, totalActiveSeconds: views * integer(random, 80, 420),
      averageActiveSeconds: integer(random, 80, 420), medianActiveSeconds: integer(random, 60, 300), quickExits,
      quickExitPercent: percent(quickExits, views), videoSeconds: index % 2 ? views * 90 : 0,
      completedUsers: integer(random, 2, viewers), lastViewedAt: `${range.to}T12:00:00.000Z`
    };
  });
  const totalViews = cards.reduce((sum, card) => sum + card.views, 0);
  const learning: LearningEngagementResponse = {
    summary: {
      uniqueViewers: Math.min(userCount, cards.reduce((sum, card) => sum + card.viewers, 0)),
      views: totalViews,
      medianActiveSeconds: integer(random, 90, 280),
      quickExitPercent: percent(cards.reduce((sum, card) => sum + card.quickExits, 0), totalViews)
    },
    cards,
    assessments: {
      homeworkSubmitted: integer(random, 8, 30), homeworkAccepted: integer(random, 5, 18),
      homeworkPendingReview: integer(random, 1, 7), homeworkNeedsRevision: integer(random, 0, 5),
      quizSubmitted: integer(random, 18, 55), quizPassed: integer(random, 12, 42)
    }
  };

  const stats: AdminStatsResponse = {
    totalUsers: userCount,
    activeUsers: activeCount,
    completedItems: users.reduce((sum, user) => sum + user.completedItems, 0),
    totalItems: lessonCount,
    users,
    paymentProductOptions: [], paymentProviderOptions: [], communityMessages: [],
    pollStats: { totalPolls: integer(random, 3, 9), activePolls: 2, closedPolls: 3, uniqueParticipants: integer(random, 10, userCount), totalVotes: integer(random, 25, 140), participationPercent: integer(random, 25, 75), polls: [] }
  };
  stats.pollStats.closedPolls = Math.max(0, stats.pollStats.totalPolls - stats.pollStats.activePolls);
  const paymentOrders: PaymentOrderLog[] = Array.from({ length: attempts }, (_, index) => {
    const paid = index < paidOrders;
    const failed = !paid && index % 2 === 0;
    const customer = users[index % users.length]!;
    const date = dates[index % dates.length]!;
    const provider = paid
      ? index < providerPaid.prodamus ? "prodamus" : "lava"
      : index % 2 ? "lava" : "prodamus";
    const providerPaidIndex = provider === "prodamus" ? index : index - providerPaid.prodamus;
    const providerPaidTotal = providerPaid[provider];
    const providerRevenueTotal = providerRevenue[provider];
    const basePaidAmount = Math.floor(providerRevenueTotal / providerPaidTotal);
    const amount = paid
      ? providerPaidIndex === providerPaidTotal - 1
        ? providerRevenueTotal - basePaidAmount * (providerPaidTotal - 1)
        : basePaidAmount
      : integer(random, 900, 4900);
    return {
      id: `demo-order-${seed}-${index}`,
      provider,
      status: paid ? "paid" : failed ? "failed" : "pending",
      amountRub: amount,
      currency: "RUB",
      amountMinor: amount * 100,
      providerOrderId: `demo-${index + 1}`,
      providerPaymentId: paid ? `demo-payment-${index + 1}` : null,
      productTitle: index % 4 ? "Основная подписка" : "Разовый доступ",
      productKind: index % 4 ? "recurrent" : "one_time",
      customer: {
        id: customer.id, telegramId: customer.telegramId, firstName: customer.firstName, username: null,
        displayName: null, photoUrl: null, avatarPositionX: 50, avatarPositionY: 50, avatarScale: 1
      },
      webhook: { isValid: true, createdAt: `${date}T12:00:00.000Z` },
      paidAt: paid ? `${date}T12:00:00.000Z` : null,
      createdAt: `${date}T11:55:00.000Z`,
      updatedAt: `${date}T12:00:00.000Z`,
      diagnostic: { state: paid ? "paid" : failed ? "failed" : "awaiting_payment", reason: "Демонстрационная операция", severity: paid ? "success" : failed ? "danger" : "info" }
    };
  });
  const activeUsers = users.filter((user) => user.membershipStatus === "active");
  const tariffCounts = new Map<string, number>();
  activeUsers.forEach((user) => tariffCounts.set(user.tariff ?? "future", (tariffCounts.get(user.tariff ?? "future") ?? 0) + 1));
  const clientTimeline = dates.map((date) => ({ date, value: users.filter((user) => user.createdAt.startsWith(date)).length }));
  const paymentTimeline = dates.map((date) => {
    const daily = paymentOrders.filter((order) => order.status === "paid" && order.createdAt.startsWith(date));
    return { date, orders: daily.length, revenueRub: daily.reduce((sum, order) => sum + (order.amountRub ?? 0), 0) };
  });
  const pendingOrders = paymentOrders.filter((order) => order.status === "pending").length;
  const failedOrders = paymentOrders.filter((order) => order.status === "failed").length;
  const restricted = users.filter((user) => user.hasRestrictions).length;
  const overview: AdminStatistics = {
    clients: {
      total: userCount, active: activeCount, inactive: userCount - activeCount, restricted,
      expiringSoon: integer(random, 2, 9), newInPeriod: userCount, timeline: clientTimeline,
      activePercent: Math.round((activeCount / userCount) * 100),
      accessBreakdown: [
        { key: "inactive", label: "Без доступа", value: userCount - activeCount },
        { key: "restricted", label: "Ограничения", value: restricted },
        { key: "expiring_soon", label: "Истекают скоро", value: 4 }
      ]
    },
    payments: {
      paidOrders, pendingOrders, failedOrders, failedWebhookOrders: 0, problemOrders: failedOrders,
      revenueRub, averagePaidOrderRub: Math.round(revenueRub / paidOrders),
      oneTimePaidOrders: Math.floor(paidOrders / 4), recurrentPaidOrders: paidOrders - Math.floor(paidOrders / 4),
      timeline: paymentTimeline,
      breakdown: [
        { key: "paid", label: "Всего оплат", value: paidOrders },
        { key: "one_time", label: "Разовые", value: Math.floor(paidOrders / 4) },
        { key: "recurrent", label: "Рекуррент", value: paidOrders - Math.floor(paidOrders / 4) },
        { key: "pending", label: "Ожидают", value: pendingOrders },
        { key: "webhook_failed", label: "Ошибки webhook", value: 0 },
        { key: "failed", label: "Ошибки оплат", value: failedOrders }
      ]
    },
    learning: {
      categoriesCount: 3, publishedMaterials: lessonCount, hiddenMaterials: 2, archivedMaterials: 1,
      averageProgressPercent: Math.round((stats.completedItems / (userCount * lessonCount)) * 100),
      completedItems: stats.completedItems, totalItems: userCount * lessonCount, popularTitle: "Материал 1"
    },
    communication: {
      topics: 6, openTopics: 5, lockedTopics: 1, archivedTopics: 1, messages: integer(random, 180, 560),
      memberMessages: integer(random, 160, 520), messagesInPeriod: integer(random, 80, 240),
      messagesLast7Days: integer(random, 20, 75), messagesLast30Days: integer(random, 80, 240), activeWriters: integer(random, 12, activeCount),
      timeline: dates.map((date) => ({ date, value: integer(random, 1, 18) })),
      hotTopic: { title: "Знакомство и поддержка", messages: integer(random, 25, 90) },
      topClients: users.slice(0, 5).map((user, index) => ({ telegramId: user.telegramId, name: user.firstName ?? `Клиент ${index + 1}`, messages: integer(random, 4, 28) }))
    },
    tariffs: Array.from(tariffCounts.entries()).map(([tariff, value]) => ({ tariff, label: tariff, value, percent: Math.round((value / activeUsers.length) * 100) })),
    contentKinds: [
      { kind: "text", label: "Текст", count: Math.ceil(lessonCount / 4) },
      { kind: "photo", label: "Фото", count: Math.ceil(lessonCount / 4) },
      { kind: "video", label: "Видео", count: Math.ceil(lessonCount / 4) },
      { kind: "audio", label: "Аудио", count: Math.floor(lessonCount / 4) }
    ]
  };
  return { stats, finance, acquisition, learning, overview, paymentOrders };
}
