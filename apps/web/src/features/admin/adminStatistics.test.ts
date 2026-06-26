import type { AdminLearningMaterial, AdminStatsUser, ClubTopic, LearningCategory, PaymentOrderLog } from "@club/shared";
import { describe, expect, it } from "vitest";
import { buildAdminStatistics } from "./adminStatistics";

const now = new Date("2026-06-26T12:00:00.000Z");

function user(overrides: Partial<AdminStatsUser>): AdminStatsUser {
  return {
    id: "user-id",
    telegramId: "100",
    firstName: null,
    username: null,
    photoUrl: null,
    role: "member",
    membershipStatus: "inactive",
    membershipExpiresAt: null,
    tariff: null,
    hasRestrictions: false,
    completedItems: 0,
    totalItems: 0,
    lastOpenedItemTitle: null,
    lastOpenedAt: null,
    createdAt: "2026-05-01T10:00:00.000Z",
    ...overrides
  };
}

function payment(overrides: Partial<PaymentOrderLog>): PaymentOrderLog {
  return {
    id: "order-id",
    status: "pending",
    amountRub: 0,
    providerOrderId: "club-order",
    providerPaymentId: null,
    productTitle: "Тариф",
    productKind: "one_time",
    customer: {
      id: "customer-id",
      telegramId: "100",
      firstName: "Иван",
      username: null,
      photoUrl: null
    },
    webhook: null,
    paidAt: null,
    createdAt: "2026-06-25T10:00:00.000Z",
    updatedAt: "2026-06-25T10:00:00.000Z",
    ...overrides
  };
}

function material(overrides: Partial<AdminLearningMaterial>): AdminLearningMaterial {
  return {
    id: "material-id",
    categoryId: "category-id",
    kind: "text",
    title: "Контент",
    summary: null,
    body: null,
    mediaUrl: null,
    thumbnailUrl: null,
    mediaContentType: null,
    mediaSizeBytes: null,
    publishedAt: "2026-06-20T10:00:00.000Z",
    isPublished: true,
    archivedUntil: null,
    createdAt: "2026-06-20T10:00:00.000Z",
    updatedAt: "2026-06-20T10:00:00.000Z",
    ...overrides
  };
}

function topic(overrides: Partial<ClubTopic>): ClubTopic {
  return {
    id: "topic-id",
    chatId: "chat-id",
    title: "Общение",
    description: null,
    isPinned: false,
    isLocked: false,
    isPublished: true,
    archivedUntil: null,
    messagesCount: 0,
    latestReplyToMeAt: null,
    createdAt: "2026-06-20T10:00:00.000Z",
    ...overrides
  };
}

const categories: LearningCategory[] = [
  { id: "start", slug: "start", title: "Старт", description: null, isPublished: true, itemsCount: 2 },
  { id: "advanced", slug: "advanced", title: "Продолжение", description: null, isPublished: false, itemsCount: 1 }
];

describe("admin statistics", () => {
  it("builds club metrics from users, payments, learning content and topics", () => {
    const stats = buildAdminStatistics(
      {
        users: [
          user({
            telegramId: "1",
            createdAt: "2026-06-25T10:00:00.000Z",
            membershipStatus: "active",
            membershipExpiresAt: "2026-06-30T00:00:00.000Z",
            tariff: "prodamus_recurrent",
            hasRestrictions: true,
            completedItems: 3,
            totalItems: 5,
            lastOpenedItemTitle: "Видео"
          }),
          user({
            telegramId: "2",
            createdAt: "2026-05-01T10:00:00.000Z",
            membershipStatus: "active",
            membershipExpiresAt: "2026-07-20T00:00:00.000Z",
            tariff: "manual",
            completedItems: 1,
            totalItems: 5,
            lastOpenedItemTitle: "Видео"
          }),
          user({ telegramId: "3", createdAt: "2026-06-24T10:00:00.000Z" })
        ],
        paymentOrders: [
          payment({ id: "recent-one-time", status: "paid", amountRub: 50, paidAt: "2026-06-25T10:00:00.000Z" }),
          payment({
            id: "recent-recurrent",
            status: "paid",
            amountRub: 100,
            productKind: "recurrent",
            paidAt: "2026-06-20T10:00:00.000Z",
            webhook: { isValid: false, createdAt: "2026-06-20T10:01:00.000Z" }
          }),
          payment({ id: "recent-pending", status: "pending", amountRub: 50, createdAt: "2026-06-25T12:00:00.000Z" }),
          payment({ id: "old-paid", status: "paid", amountRub: 1000, paidAt: "2026-05-01T10:00:00.000Z" })
        ],
        learningCategories: categories,
        learningMaterials: [
          material({ id: "text", kind: "text" }),
          material({ id: "video", kind: "video" }),
          material({ id: "audio", kind: "audio", isPublished: false, publishedAt: null }),
          material({ id: "photo", kind: "photo", archivedUntil: "2026-07-01T00:00:00.000Z" })
        ],
        communityTopics: [
          topic({ id: "open", messagesCount: 34 }),
          topic({ id: "locked", isLocked: true, messagesCount: 2 })
        ]
      },
      { period: "30d", now }
    );

    expect(stats.clients).toMatchObject({
      total: 3,
      active: 2,
      inactive: 1,
      restricted: 1,
      expiringSoon: 1,
      newInPeriod: 2,
      activePercent: 67
    });
    expect(stats.payments).toMatchObject({
      paidOrders: 2,
      pendingOrders: 1,
      failedWebhookOrders: 1,
      revenueRub: 150,
      averagePaidOrderRub: 75,
      oneTimePaidOrders: 1,
      recurrentPaidOrders: 1
    });
    expect(stats.payments.breakdown.map((item) => [item.label, item.value])).toEqual([
      ["Оплачено", 2],
      ["Разовые", 1],
      ["Рекуррент", 1],
      ["Ожидают", 1],
      ["Ошибки webhook", 1],
      ["Ошибки оплат", 0]
    ]);
    expect(stats.payments.breakdown.map((item) => item.key)).toEqual([
      "paid",
      "one_time",
      "recurrent",
      "pending",
      "webhook_failed",
      "failed"
    ]);
    expect(stats.learning).toMatchObject({
      categoriesCount: 2,
      publishedMaterials: 2,
      hiddenMaterials: 1,
      archivedMaterials: 1,
      averageProgressPercent: 40,
      popularTitle: "Видео"
    });
    expect(stats.communication).toMatchObject({
      topics: 2,
      openTopics: 1,
      lockedTopics: 1,
      messages: 36
    });
    expect(stats.tariffs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Рекуррент Prodamus", value: 1, percent: 33 }),
        expect.objectContaining({ label: "Ручной доступ", value: 1, percent: 33 }),
        expect.objectContaining({ label: "Без тарифа", value: 1, percent: 33 })
      ])
    );
    expect(stats.contentKinds.map((item) => [item.kind, item.count])).toEqual([
      ["text", 1],
      ["photo", 1],
      ["video", 1],
      ["audio", 1]
    ]);
  });
});
