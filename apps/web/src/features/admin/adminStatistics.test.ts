import type { AdminCommunityMessage, AdminLearningMaterial, AdminStatsUser, ClubTopic, LearningCategory, PaymentOrderLog } from "@club/shared";
import { describe, expect, it } from "vitest";
import { buildAdminStatistics } from "./adminStatistics";

const now = new Date("2026-06-26T12:00:00.000Z");
const defaultAvatarDisplay = {
  avatarPositionX: 50,
  avatarPositionY: 50,
  avatarScale: 1
};

function author(overrides: Partial<AdminCommunityMessage["author"]>): AdminCommunityMessage["author"] {
  return {
    id: "author-id",
    telegramId: "100",
    firstName: "Иван",
    username: null,
    photoUrl: null,
    ...defaultAvatarDisplay,
    ...overrides
  };
}

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
    lastLoginAt: "2026-05-01T10:00:00.000Z",
    telegramBotStatus: "unknown",
    telegramBotBlockedAt: null,
    telegramBotUnblockedAt: null,
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
      photoUrl: null,
      ...defaultAvatarDisplay
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
    cardLayout: "vertical",
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

function communityMessage(overrides: Partial<AdminCommunityMessage>): AdminCommunityMessage {
  return {
    id: "message-id",
    topicId: "topic-id",
    topicTitle: "Общение",
    isSystem: false,
    status: "visible",
    author: author({}),
    createdAt: "2026-06-25T10:00:00.000Z",
    ...overrides
  };
}

const categories: LearningCategory[] = [
  { id: "start", slug: "start", title: "Старт", description: null, defaultCardLayout: "vertical", isPublished: true, itemsCount: 2 },
  { id: "advanced", slug: "advanced", title: "Продолжение", description: null, defaultCardLayout: "vertical", isPublished: false, itemsCount: 1 }
];

describe("admin statistics", () => {
  it("filters period metrics by custom date range", () => {
    const stats = buildAdminStatistics(
      {
        users: [
          user({ telegramId: "1", createdAt: "2026-06-10T10:00:00.000Z" }),
          user({ telegramId: "2", createdAt: "2026-06-20T10:00:00.000Z" })
        ],
        paymentOrders: [
          payment({ id: "inside", status: "paid", amountRub: 100, paidAt: "2026-06-10T10:00:00.000Z" }),
          payment({ id: "outside", status: "paid", amountRub: 900, paidAt: "2026-06-20T10:00:00.000Z" })
        ],
        learningCategories: categories,
        learningMaterials: [],
        communityTopics: [],
        communityMessages: [
          communityMessage({ id: "inside-message", createdAt: "2026-06-12T10:00:00.000Z" }),
          communityMessage({ id: "outside-message", createdAt: "2026-06-20T10:00:00.000Z" })
        ]
      },
      {
        period: "custom",
        dateRange: { from: "2026-06-09", to: "2026-06-15" },
        now
      }
    );

    expect(stats.clients.newInPeriod).toBe(1);
    expect(stats.payments.paidOrders).toBe(1);
    expect(stats.payments.revenueRub).toBe(100);
    expect(stats.communication.messagesInPeriod).toBe(1);
  });

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
          user({ telegramId: "3", createdAt: "2026-06-24T10:00:00.000Z" }),
          user({
            telegramId: "4",
            createdAt: "2026-06-23T10:00:00.000Z",
            membershipStatus: "inactive",
            tariff: "manual"
          })
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
        ],
        communityMessages: [
          communityMessage({
            id: "m1",
            topicId: "open",
            topicTitle: "Новости клуба",
            author: author({ id: "ivan", telegramId: "1", firstName: "Иван", username: "ivan", photoUrl: null }),
            createdAt: "2026-06-25T10:00:00.000Z"
          }),
          communityMessage({
            id: "m2",
            topicId: "open",
            topicTitle: "Новости клуба",
            author: author({ id: "ivan", telegramId: "1", firstName: "Иван", username: "ivan", photoUrl: null }),
            createdAt: "2026-06-24T10:00:00.000Z"
          }),
          communityMessage({
            id: "m3",
            topicId: "locked",
            topicTitle: "Вопросы",
            author: author({ id: "anna", telegramId: "2", firstName: "Анна", username: null, photoUrl: null }),
            createdAt: "2026-06-10T10:00:00.000Z"
          }),
          communityMessage({
            id: "m4",
            topicId: "open",
            topicTitle: "Новости клуба",
            author: author({ id: "system", telegramId: "0", firstName: "Система", username: null, photoUrl: null }),
            isSystem: true,
            createdAt: "2026-06-25T12:00:00.000Z"
          }),
          communityMessage({
            id: "m5",
            topicId: "open",
            topicTitle: "Новости клуба",
            author: author({ id: "hidden", telegramId: "3", firstName: "Скрыт", username: null, photoUrl: null }),
            status: "hidden",
            createdAt: "2026-06-25T12:00:00.000Z"
          })
        ]
      },
      { period: "30d", now }
    );

    expect(stats.clients).toMatchObject({
      total: 4,
      active: 2,
      inactive: 2,
      restricted: 1,
      expiringSoon: 1,
      newInPeriod: 3,
      activePercent: 50
    });
    expect(stats.clients.accessBreakdown.map((item) => [item.key, item.label, item.value])).toEqual([
      ["inactive", "Без доступа", 2],
      ["restricted", "Ограничения", 1],
      ["expiring_soon", "Истекают скоро", 1]
    ]);
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
      ["Всего оплат", 2],
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
      messages: 36,
      memberMessages: 3,
      messagesInPeriod: 3,
      messagesLast7Days: 2,
      messagesLast30Days: 3,
      activeWriters: 2,
      hotTopic: {
        title: "Новости клуба",
        messages: 2
      }
    });
    expect(stats.communication.topClients.map((client) => [client.telegramId, client.name, client.messages])).toEqual([
      ["1", "Иван", 2],
      ["2", "Анна", 1]
    ]);
    expect(stats.tariffs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Рекуррент Prodamus", value: 1, percent: 50 }),
        expect.objectContaining({ label: "Ручной доступ", value: 1, percent: 50 })
      ])
    );
    expect(stats.tariffs).toHaveLength(2);
    expect(stats.tariffs.find((item) => item.tariff === "manual")?.value).toBe(1);
    expect(stats.contentKinds.map((item) => [item.kind, item.count])).toEqual([
      ["text", 1],
      ["photo", 1],
      ["video", 1],
      ["audio", 1]
    ]);
  });
});
