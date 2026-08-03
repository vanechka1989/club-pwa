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
export type ShowcaseAnalyticsCatalog = {
  products: NonNullable<AdminStatsResponse["paymentProductOptions"]>;
  providers: NonNullable<AdminStatsResponse["paymentProviderOptions"]>;
};

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

export function createShowcaseAnalytics(seed: number, range: DateRange, catalog?: ShowcaseAnalyticsCatalog): {
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
  const products = catalog?.products.length ? catalog.products : [{ id: uuid(9001), title: "Основная подписка", kind: "recurrent" as const }];
  const providers = catalog?.providers.length ? catalog.providers : [
    { code: "prodamus" as const, title: "Prodamus" },
    { code: "lava" as const, title: "Lava" }
  ];
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
      tariff: null,
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

  const paidOrders = Math.max(integer(random, 28, 64), products.length, providers.length);
  const attempts = paidOrders + integer(random, 4, 17);
  const orderBlueprints = Array.from({ length: attempts }, (_, index) => {
    const paid = index < paidOrders;
    const provider = providers[index < providers.length ? index : integer(random, 0, providers.length - 1)]!;
    const product = products[index < products.length ? index : integer(random, 0, products.length - 1)]!;
    return {
      paid,
      failed: !paid && index % 2 === 0,
      provider,
      product,
      customerIndex: paid ? index % activeCount : index % userCount,
      date: dates[index % dates.length]!,
      amountRub: integer(random, product.kind === "recurrent" ? 1200 : 800, product.kind === "recurrent" ? 6900 : 4900)
    };
  });
  const paidBlueprints = orderBlueprints.filter((order) => order.paid);
  for (const order of paidBlueprints) {
    const user = users[order.customerIndex]!;
    user.tariff = order.product.title;
    user.paymentProductIds = Array.from(new Set([...(user.paymentProductIds ?? []), order.product.id]));
    user.paymentProviders = Array.from(new Set([...(user.paymentProviders ?? []), order.provider.code]));
  }
  const revenueRub = paidBlueprints.reduce((sum, order) => sum + order.amountRub, 0);
  const providerRows = providers.map((provider) => {
    const providerOrders = orderBlueprints.filter((order) => order.provider.code === provider.code);
    const providerPaidOrders = providerOrders.filter((order) => order.paid);
    const providerRevenue = providerPaidOrders.reduce((sum, order) => sum + order.amountRub, 0);
    const uniqueCustomers = new Set(providerPaidOrders.map((order) => order.customerIndex)).size;
    return {
      provider: provider.code,
      title: provider.title,
      attempts: providerOrders.length,
      paidOrders: providerPaidOrders.length,
      uniqueCustomers,
      revenueRub: providerRevenue,
      averagePaidOrderRub: providerPaidOrders.length ? Math.round(providerRevenue / providerPaidOrders.length) : 0,
      revenuePercent: percent(providerRevenue, revenueRub),
      successPercent: percent(providerPaidOrders.length, providerOrders.length)
    };
  });
  const productRows = products.map((product) => {
    const productPaidOrders = paidBlueprints.filter((order) => order.product.id === product.id);
    const productRevenue = productPaidOrders.reduce((sum, order) => sum + order.amountRub, 0);
    return {
      productId: product.id,
      title: product.title,
      kind: product.kind,
      paidOrders: productPaidOrders.length,
      uniqueCustomers: new Set(productPaidOrders.map((order) => order.customerIndex)).size,
      revenueRub: productRevenue,
      averagePaidOrderRub: productPaidOrders.length ? Math.round(productRevenue / productPaidOrders.length) : 0,
      revenuePercent: percent(productRevenue, revenueRub)
    };
  });
  const payingCustomerIndexes = Array.from(new Set(paidBlueprints.map((order) => order.customerIndex)));
  const totalPayingCustomers = payingCustomerIndexes.length;
  const retained = totalPayingCustomers > 1
    ? integer(random, Math.ceil(totalPayingCustomers * 0.55), totalPayingCustomers - 1)
    : totalPayingCustomers;
  const churned = totalPayingCustomers - retained;
  const randomizedCustomerIndexes = [...payingCustomerIndexes];
  for (let index = randomizedCustomerIndexes.length - 1; index > 0; index -= 1) {
    const swapIndex = integer(random, 0, index);
    [randomizedCustomerIndexes[index], randomizedCustomerIndexes[swapIndex]] = [randomizedCustomerIndexes[swapIndex]!, randomizedCustomerIndexes[index]!];
  }
  const retainedCustomerIndexes = new Set(randomizedCustomerIndexes.slice(0, retained));
  const lastPaidByCustomer = new Map<number, (typeof paidBlueprints)[number]>();
  for (const order of paidBlueprints) lastPaidByCustomer.set(order.customerIndex, order);
  const providerRetention = providers.map((provider) => {
    const customerIndexes = Array.from(lastPaidByCustomer.entries()).filter(([, order]) => order.provider.code === provider.code).map(([customerIndex]) => customerIndex);
    const activeCustomers = customerIndexes.filter((customerIndex) => retainedCustomerIndexes.has(customerIndex)).length;
    const churnedCustomers = customerIndexes.length - activeCustomers;
    return { key: provider.code, title: provider.title, totalCustomers: customerIndexes.length, activeCustomers, churnedCustomers, churnedPercent: percent(churnedCustomers, customerIndexes.length) };
  });
  const productRetention = products.map((product) => {
    const customerIndexes = Array.from(lastPaidByCustomer.entries()).filter(([, order]) => order.product.id === product.id).map(([customerIndex]) => customerIndex);
    const activeCustomers = customerIndexes.filter((customerIndex) => retainedCustomerIndexes.has(customerIndex)).length;
    const churnedCustomers = customerIndexes.length - activeCustomers;
    return { key: product.id, title: product.title, totalCustomers: customerIndexes.length, activeCustomers, churnedCustomers, churnedPercent: percent(churnedCustomers, customerIndexes.length) };
  });
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
    products: productRows,
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
      byProviders: providerRetention,
      byProducts: productRetention
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
    paymentProductOptions: products, paymentProviderOptions: providers, communityMessages: [],
    pollStats: { totalPolls: integer(random, 3, 9), activePolls: 2, closedPolls: 3, uniqueParticipants: integer(random, 10, userCount), totalVotes: integer(random, 25, 140), participationPercent: integer(random, 25, 75), polls: [] }
  };
  stats.pollStats.closedPolls = Math.max(0, stats.pollStats.totalPolls - stats.pollStats.activePolls);
  const paymentOrders: PaymentOrderLog[] = orderBlueprints.map((order, index) => {
    const customer = users[order.customerIndex]!;
    return {
      id: `demo-order-${seed}-${index}`,
      provider: order.provider.code,
      status: order.paid ? "paid" : order.failed ? "failed" : "pending",
      amountRub: order.amountRub,
      currency: "RUB",
      amountMinor: order.amountRub * 100,
      providerOrderId: `demo-${index + 1}`,
      providerPaymentId: order.paid ? `demo-payment-${index + 1}` : null,
      productTitle: order.product.title,
      productKind: order.product.kind,
      customer: {
        id: customer.id, telegramId: customer.telegramId, firstName: customer.firstName, username: null,
        displayName: null, photoUrl: null, avatarPositionX: 50, avatarPositionY: 50, avatarScale: 1
      },
      webhook: { isValid: true, createdAt: `${order.date}T12:00:00.000Z` },
      paidAt: order.paid ? `${order.date}T12:00:00.000Z` : null,
      createdAt: `${order.date}T11:55:00.000Z`,
      updatedAt: `${order.date}T12:00:00.000Z`,
      diagnostic: { state: order.paid ? "paid" : order.failed ? "failed" : "awaiting_payment", reason: "Демонстрационная операция", severity: order.paid ? "success" : order.failed ? "danger" : "info" }
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
  const oneTimePaidOrders = paidBlueprints.filter((order) => order.product.kind === "one_time").length;
  const recurrentPaidOrders = paidOrders - oneTimePaidOrders;
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
      oneTimePaidOrders, recurrentPaidOrders,
      timeline: paymentTimeline,
      breakdown: [
        { key: "paid", label: "Всего оплат", value: paidOrders },
        { key: "one_time", label: "Разовые", value: oneTimePaidOrders },
        { key: "recurrent", label: "Рекуррент", value: recurrentPaidOrders },
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
