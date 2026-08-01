import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { expect, test, type Page, type Route, type TestInfo } from "@playwright/test";
import { pwaUiScreenshotViewports } from "./pwa-ui-routes";

const require = createRequire(import.meta.url);
const apiBaseUrl = "http://localhost:3000";
const appApiUrlPattern = /^https?:\/\/(?:127\.0\.0\.1|localhost):\d+\/api\/.*/;
const now = "2026-07-01T10:00:00.000Z";
const activeUntil = "2026-08-30T00:00:00.000Z";
const individualOfferToken = "AbCdEf0123456789_-AbCdEf0123456789_-AbCdEf";
const errorTrackerGroup = {
  id: "506b24dd-1109-40e0-8933-1b96d0b1a619",
  fingerprint: "a".repeat(64),
  title: "Не удалось открыть оплату",
  source: "client",
  kind: "payment-open-error:83a2e303-4a0b-4754",
  severity: "critical",
  status: "new",
  route: "/billing",
  firstRelease: "5.74",
  latestRelease: "5.75",
  totalCount: 4,
  affectedUsers: 2,
  affectedDevices: 2,
  firstSeenAt: now,
  lastSeenAt: now,
  lastNotifiedAt: now,
  resolvedAt: null,
  mutedUntil: null
};

const currentUser = {
  id: "user-owner",
  telegramId: "593677751",
  displayName: "Екатерина",
  firstName: "Екатерина",
  username: "katya",
  photoUrl: "https://cdn.example.com/avatar.jpg",
  role: "owner",
  realRole: "owner",
  adminRoleLabel: null,
  adminPermissions: [],
  membershipStatus: "active",
  membershipExpiresAt: activeUntil,
  paymentType: "manual",
  recurrentPaymentStatus: null,
  nextPaymentAt: null,
  avatarRefreshedAt: null
};

const ownAuthor = {
  id: currentUser.id,
  telegramId: currentUser.telegramId,
  firstName: currentUser.firstName,
  username: currentUser.username,
  photoUrl: null
};

const memberAuthor = {
  id: "member-1",
  telegramId: "753327296",
  firstName: "Ivan",
  username: "ivan",
  photoUrl: null
};

const supportTicket = {
  id: "ticket-payment",
  topic: "payment",
  topicTitle: "Оплата",
  customTopic: null,
  message: "Тест",
  status: "open",
  statusLabel: "Открыто",
  waitingSince: now,
  customer: {
    telegramId: currentUser.telegramId,
    firstName: currentUser.firstName,
    username: currentUser.username,
    photoUrl: null
  },
  messages: [
    {
      id: "ticket-message-customer",
      authorRole: "customer",
      body: "Тест",
      author: ownAuthor,
      attachments: [
        {
          id: "support-photo-1",
          kind: "photo",
          fileName: "proof.webp",
          url: "/icons/icon-512.png",
          contentType: "image/webp",
          sizeBytes: 1024,
          createdAt: now
        }
      ],
      createdAt: now
    },
    {
      id: "ticket-message-admin",
      authorRole: "admin",
      body: "Тру ля ля",
      author: ownAuthor,
      attachments: [],
      createdAt: "2026-07-01T10:10:00.000Z"
    }
  ],
  unread: false,
  createdAt: now,
  updatedAt: "2026-07-01T10:10:00.000Z"
};

const adminLearningCategory = {
  id: "module-main",
  slug: "main",
  title: "Модуль 1",
  description: "Первый модуль клуба. Внутри будут уроки и материалы первого блока.",
  defaultCardLayout: "vertical",
  isPublished: true,
  itemsCount: 1
};

const adminLearningMaterial = {
  id: "lesson-admin-1",
  categoryId: adminLearningCategory.id,
  kind: "video",
  title: "Видео для теста ютуба",
  summary: "Короткое описание",
  body: "Содержимое урока",
  mediaUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  mediaSource: "youtube",
  thumbnailUrl: null,
  cardLayout: "vertical",
  mediaContentType: "video/mp4",
  mediaSizeBytes: 1024,
  materials: [],
  isPublished: true,
  archivedUntil: null,
  publishedAt: now,
  createdAt: now,
  updatedAt: now
};

const adminStatsUser = {
  id: currentUser.id,
  telegramId: currentUser.telegramId,
  email: "ekaterina.with.a.long.contact.address@example.com",
  firstName: "Екатерина С Очень Длинной Фамилией Для Проверки Переноса",
  username: "katya.long.username.with.many.parts",
  photoUrl: currentUser.photoUrl,
  role: "owner",
  membershipStatus: "active",
  membershipExpiresAt: activeUntil,
  tariff: "manual",
  hasRestrictions: false,
  completedItems: 4,
  totalItems: 9,
  lastOpenedItemTitle: "Очень длинное название урока для проверки переноса текста в карточке клиента",
  lastOpenedAt: now,
  lastLoginAt: now,
  telegramBotStatus: "active",
  telegramBotBlockedAt: null,
  telegramBotUnblockedAt: null,
  createdAt: "2026-06-01T10:00:00.000Z"
};

const inactiveStatsUser = {
  ...adminStatsUser,
  id: "user-inactive",
  telegramId: "777777777",
  firstName: "Клиент Без Доступа",
  email: null,
  username: null,
  role: "member",
  membershipStatus: "inactive",
  membershipExpiresAt: null,
  tariff: null,
  hasRestrictions: true,
  completedItems: 0,
  totalItems: 9,
  lastOpenedItemTitle: null,
  lastLoginAt: null,
  telegramBotStatus: "blocked",
  telegramBotBlockedAt: now,
  createdAt: "2026-06-15T10:00:00.000Z"
};

const closedStatsUser = {
  ...adminStatsUser,
  id: "user-closed",
  telegramId: "888888888",
  email: null,
  firstName: "Клиент С Закрытым Доступом",
  username: "closed.client",
  photoUrl: null,
  role: "member",
  membershipStatus: "inactive",
  membershipExpiresAt: null,
  tariff: "lava",
  hasRestrictions: false,
  completedItems: 2,
  totalItems: 9,
  lastOpenedItemTitle: null,
  lastOpenedAt: null,
  lastLoginAt: "2026-06-20T08:00:00.000Z",
  telegramBotStatus: "unknown",
  telegramBotBlockedAt: null,
  createdAt: "2026-06-10T10:00:00.000Z"
};

const adminUser = {
  id: "admin-owner",
  telegramId: currentUser.telegramId,
  firstName: currentUser.firstName,
  username: currentUser.username,
  photoUrl: currentUser.photoUrl,
  roleLabel: "Владелец",
  isActive: true,
  permissions: [],
  createdAt: now
};

const adminPaymentOrder = {
  id: "payment-paid-long-id",
  status: "paid",
  amountRub: 5000,
  providerOrderId: "PROVIDER-ORDER-WITH-LONG-ID-1234567890",
  providerPaymentId: "PROVIDER-PAYMENT-WITH-LONG-ID-0987654321",
  productTitle: "Ручной доступ с очень длинным названием тарифа",
  productKind: "one_time",
  customer: ownAuthor,
  webhook: { isValid: true, createdAt: now },
  paidAt: now,
  createdAt: now,
  updatedAt: now
};

const adminMailing = {
  id: "mailing-demo",
  title: "Длинная рассылка для проверки переносов заголовка на узком экране",
  body: "Текст рассылки с длинным URL https://example.com/some/really/long/path/that/must/wrap и обычным сообщением.",
  bodyHtml: null,
  channel: "app",
  filters: {
    accessStatus: "active",
    accessType: "all",
    excludeAdmins: true,
    excludeRestricted: true
  },
  status: "completed",
  scheduledAt: null,
  startedAt: now,
  completedAt: now,
  createdBy: ownAuthor,
  targetCount: 18,
  deliveryCount: 18,
  sentCount: 17,
  failedCount: 1,
  skippedCount: 0,
  pendingCount: 0,
  processingCount: 0,
  estimatedSeconds: 12,
  estimatedLabel: "около 12 секунд",
  attachment: null,
  createdAt: now,
  updatedAt: now
};

const s3StorageSettings = {
  configured: true,
  source: "database",
  endpoint: "https://storage.example.com",
  bucket: "club-pwa",
  region: "ru-1",
  publicBaseUrl: "https://cdn.example.com",
  signedUrlTtlSeconds: 900,
  accessKeyConfigured: true,
  secretKeyConfigured: true,
  reserveConfigured: false,
  reserveEndpoint: null,
  reserveBucket: null,
  reserveRegion: null,
  reservePublicBaseUrl: null,
  reserveAccessKeyConfigured: false,
  reserveSecretKeyConfigured: false,
  updatedAt: now
};

const s3StorageObject = {
  key: "learning/very-long-folder-name/demo-file-with-long-readable-name.pdf",
  sizeBytes: 1_048_576,
  lastModified: now,
  etag: "etag-demo",
  category: "learning",
  categoryLabel: "Уроки",
  fileKind: "document",
  entityTitle: "Длинное название файла в хранилище",
  uploadedBy: ownAuthor
};

function json(body: unknown) {
  return {
    contentType: "application/json",
    body: JSON.stringify(body)
  };
}

function learningHomeResponse() {
  return {
    categories: [
      {
        id: "module-main",
        slug: "main",
        title: "Тест видео",
        description: "Модуль клуба",
        defaultCardLayout: "vertical",
        isPublished: true,
        itemsCount: 1
      }
    ],
    featured: [],
    progress: {
      totalItems: 9,
      completedItems: 0,
      lastOpenedItem: {
        id: "lesson-1",
        categoryId: "module-main",
        kind: "video",
        title: "Тест видео",
        summary: "Последний просмотренный урок",
        body: null,
        mediaUrl: "https://cdn.example.com/video.mp4",
        thumbnailUrl: null,
        cardLayout: "vertical",
        mediaContentType: "video/mp4",
        mediaSizeBytes: 1024,
        materials: [],
        publishedAt: now
      },
      lastOpenedMaterialId: null,
      lastOpenedAt: now,
      lastOpenedPlaybackPositionSeconds: 13
    }
  };
}

function communityMessagesResponse() {
  return {
    messages: [
      {
        id: "message-own",
        topicId: "topic-fix",
        body: "Супер",
        isSystem: false,
        status: "visible",
        author: ownAuthor,
        replyTo: null,
        likesCount: 0,
        dislikesCount: 0,
        reactionCounts: [],
        myReaction: null,
        authorMute: null,
        createdAt: now
      },
      {
        id: "message-member",
        topicId: "topic-fix",
        body: "Бот не нравится мне такая адаптация под мой айфончик",
        isSystem: false,
        status: "visible",
        author: memberAuthor,
        replyTo: null,
        likesCount: 0,
        dislikesCount: 0,
        reactionCounts: [{ reaction: "fire", count: 1 }],
        myReaction: null,
        authorMute: null,
        createdAt: "2026-07-01T07:37:00.000Z"
      }
    ],
    mutedUntil: null,
    mutedPermanently: false
  };
}

async function mockApi(page: Page, sessionUser = currentUser) {
  const handleApiRoute = async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.startsWith("/api/") ? url.pathname.slice(4) : url.pathname;

    if (path === "/me") {
      await route.fulfill(json({ user: sessionUser }));
      return;
    }

    if (path === "/me/device" && request.method() === "POST") {
      await route.fulfill(json({ ok: true, user: sessionUser }));
      return;
    }

    if (path === "/me/referrals" && request.method() === "GET") {
      await route.fulfill(
        json({
          referral: {
            code: "ref_demo",
            link: "https://t.me/tehnobot_club_bot?start=ref_demo",
            invitedCount: 1,
            paidCount: 0,
            availableDays: 0,
            activatedDays: 0,
            canActivate: false,
            activationBlockedReason: "no_available_days"
          },
          settings: {
            referralRewardDays: 7
          }
        })
      );
      return;
    }

    if (path === "/learning") {
      await route.fulfill(json(learningHomeResponse()));
      return;
    }

    if (path === "/learning/items/lesson-admin-1") {
      await route.fulfill(
        json({
          item: adminLearningMaterial,
          completedAt: null,
          lastOpenedMaterialId: null,
          playbackPositionSeconds: 13
        })
      );
      return;
    }

    if (path === "/learning/items/lesson-admin-1/comments") {
      await route.fulfill(json({ comments: [], mutedUntil: null, mutedPermanently: false }));
      return;
    }

    if (path === "/learning/items/lesson-admin-1/playback") {
      await route.fulfill(json({ ok: true, lastOpenedMaterialId: null, playbackPositionSeconds: 13 }));
      return;
    }

    if (path === "/payments/orders") {
      await route.fulfill(json({ orders: [adminPaymentOrder] }));
      return;
    }

    if (path === `/payments/offers/${individualOfferToken}`) {
      await route.fulfill(json({
        offer: {
          id: "22222222-2222-4222-8222-222222222222",
          provider: "prodamus",
          kind: "one_time",
          title: "Персональный доступ к клубу",
          currency: "RUB",
          amountMinor: 149000,
          accessDays: 45,
          status: "active",
          expiresAt: "2026-08-01T10:00:00.000Z",
          createdAt: now,
          firstOpenedAt: now,
          checkoutStartedAt: null,
          paidAt: null,
          cancelledAt: null
        }
      }));
      return;
    }

    if (path === "/payments/plans") {
      await route.fulfill(
        json({
          plans: [],
          provider: null,
          products: [
            {
              id: "product-30",
              providerId: "provider-demo",
              kind: "one_time",
              title: "Разовая оплата 30 дней",
              description: "Доступ на 30 дней",
              amountRub: 500,
              accessDays: 30,
              prodamusSubscriptionId: null,
              isPublished: true,
              archivedUntil: null,
              bindings: [],
              createdAt: now,
              updatedAt: now
            },
            {
              id: "product-180",
              providerId: "provider-demo",
              kind: "one_time",
              title: "Разовая оплата 180 дней",
              description: "Доступ на 180 дней",
              amountRub: 2400,
              accessDays: 180,
              prodamusSubscriptionId: null,
              isPublished: true,
              archivedUntil: null,
              bindings: [],
              createdAt: now,
              updatedAt: now
            },
            {
              id: "product-recurring",
              providerId: "provider-demo",
              kind: "recurrent",
              title: "Автоподписка 30 дней",
              description: "Автоматическое продление доступа",
              amountRub: 500,
              accessDays: 30,
              prodamusSubscriptionId: "subscription-recurring",
              isPublished: true,
              archivedUntil: null,
              bindings: [],
              createdAt: now,
              updatedAt: now
            }
          ],
          recurrentSubscriptions: []
        })
      );
      return;
    }

    if (path === "/payments/admin/provider") {
      await route.fulfill(json({ provider: null, webhookUrl: "https://club.example/api/payments/prodamus/webhook" }));
      return;
    }

    if (path === "/payments/admin/providers") {
      await route.fulfill(json({ providers: [], lavaWebhookUrls: null }));
      return;
    }

    if (path === "/payments/admin/providers/lava/catalog") {
      await route.fulfill(json({ items: [] }));
      return;
    }

    if (path === "/support") {
      await route.fulfill(
        json({
          topics: [
            { id: "payment", title: "Оплата", description: "Платежи и подписки." },
            { id: "access", title: "Доступ", description: "Проблемы с доступом." }
          ],
          managerContact: null,
          tickets: [supportTicket],
          unreadCount: 0
        })
      );
      return;
    }

    if (path === "/support/admin/tickets") {
      await route.fulfill(json({ tickets: [supportTicket], unreadCount: 0 }));
      return;
    }

    if (path === "/support/tickets/ticket-payment/read") {
      await route.fulfill(json({ ok: true, ticket: supportTicket, unreadCount: 0 }));
      return;
    }

    if (path === "/support/unread") {
      await route.fulfill(json({ unreadCount: 0 }));
      return;
    }

    if (path === "/notifications") {
      await route.fulfill(json({ notifications: [], unreadCount: 0 }));
      return;
    }

    if (path === "/admin/server-status") {
      await route.fulfill(
        json({
          status: {
            ok: true,
            checkedAt: now,
            processUptimeSeconds: 3600,
            systemUptimeSeconds: 86400,
            cpuCount: 2,
            loadAverage: [0.12, 0.18, 0.21],
            processMemory: { rssBytes: 84_000_000, heapUsedBytes: 32_000_000, heapTotalBytes: 64_000_000 },
            systemMemory: { usedBytes: 1_000_000_000, totalBytes: 2_000_000_000, freeBytes: 1_000_000_000, usedPercent: 50 },
            disk: { usedBytes: 6_000_000_000, totalBytes: 20_000_000_000, freeBytes: 14_000_000_000, usedPercent: 30 },
            storageMaintenance: null,
            serverErrorCount: 0,
            requestMetrics: { requests: 24, failedRequests: 0, requestsPerMinute: 6, errorRatePercent: 0, averageDurationMs: 18, p95DurationMs: 32, maxDurationMs: 45, windowSeconds: 240 }
          }
        })
      );
      return;
    }

    if (path === "/admin/integration-health") {
      await route.fulfill(json({ items: [] }));
      return;
    }

    if (path === "/admin/error-tracker/summary") {
      await route.fulfill(json({ newCritical: 1, activeGroups: 1, affectedUsers24h: 2, occurrences24h: 4 }));
      return;
    }

    if (path === `/admin/error-tracker/groups/${errorTrackerGroup.id}`) {
      await route.fulfill(json({
        group: errorTrackerGroup,
        occurrences: [{
          id: "9db38811-2236-4126-8c86-86302b7b80f3",
          message: "Платёжная ссылка не была сформирована.",
          stack: "Error: checkout request failed\n    at openPayment (/billing)",
          route: "/billing",
          method: "POST",
          httpStatus: 502,
          release: "5.75",
          userId: null,
          installationId: "install-test",
          platform: "Android 14",
          userAgent: "Chrome Mobile",
          context: { provider: "lava" },
          occurredAt: now
        }],
        deliveries: [{
          id: "b3d38811-2236-4126-8c86-86302b7b80f3", channel: "push", status: "sent", attemptCount: 1,
          lastError: null, createdAt: now, updatedAt: now
        }]
      }));
      return;
    }

    if (path === "/admin/error-tracker/groups") {
      await route.fulfill(json({ groups: [errorTrackerGroup], total: 1, nextCursor: null }));
      return;
    }

    if (path === "/admin/error-tracker/settings") {
      await route.fulfill(json({ email: "owner@example.com", emailEnabled: true, pushEnabled: true }));
      return;
    }

    if (path === "/admin/server-errors") {
      await route.fulfill(json({ errors: [] }));
      return;
    }

    if (path === "/admin/admins") {
      await route.fulfill(json({ ownerTelegramId: currentUser.telegramId, admins: [adminUser] }));
      return;
    }

    if (path === "/admin/stats") {
      await route.fulfill(
        json({
          totalUsers: 3,
          activeUsers: 1,
          completedItems: 4,
          totalItems: 18,
          users: [adminStatsUser, inactiveStatsUser, closedStatsUser],
          communityMessages: [
            {
              id: "admin-community-message",
              topicId: "topic-fix",
              topicTitle: "Фиксики",
              isSystem: false,
              status: "visible",
              author: memberAuthor,
              createdAt: now
            }
          ]
        })
      );
      return;
    }

    if (path === "/admin/stats/users/593677751") {
      await route.fulfill(json(adminStatsUser));
      return;
    }

    if (path === "/admin/stats/users/593677751/detail") {
      await route.fulfill(
        json({
          user: adminStatsUser,
          subscriptions: [
            {
              id: "subscription-manual",
              status: "active",
              tariff: "manual",
              provider: "manual",
              providerPaymentId: null,
              changedBy: currentUser.telegramId,
              expiresAt: activeUntil,
              createdAt: now
            }
          ],
          moderationEvents: [],
          device: null,
          referrals: { invitedBy: null, invited: [] }
        })
      );
      return;
    }

    if (path === "/admin/learning") {
      await route.fulfill(json({ categories: [adminLearningCategory], materials: [adminLearningMaterial], deletedMaterials: [] }));
      return;
    }

    if (path === "/payments/admin/orders") {
      await route.fulfill(json({ orders: [adminPaymentOrder] }));
      return;
    }

    if (path === "/admin/action-logs") {
      await route.fulfill(json({ admins: [], logs: [] }));
      return;
    }

    if (path === "/admin/project-settings") {
      await route.fulfill(json({ settings: { referralRewardDays: 7 } }));
      return;
    }

    if (path === "/admin/mailings" && request.method() === "GET") {
      await route.fulfill(json({
        mailings: [adminMailing],
        emailQuota: {
          used: 0,
          remaining: 2000,
          limit: 2000,
          windowHours: 24,
          maxRecipientsPerMessage: 1000,
          messagesPerSecond: 5,
          resetsAt: null
        }
      }));
      return;
    }

    if (path === "/admin/mailings/mailing-demo/analytics") {
      await route.fulfill(json({
        trackingEnabledAt: now,
        emailOpenEstimate: true,
        summary: { sent: 17, opened: 0, clicked: 0, openRate: 0, clickRate: 0, clickToOpenRate: 0 },
        channels: [],
        timeline: [],
        links: []
      }));
      return;
    }

    if (path === "/admin/mailings/mailing-demo/analytics/recipients") {
      await route.fulfill(json({ recipients: [], nextCursor: null }));
      return;
    }

    if (path === "/admin/storage/s3") {
      await route.fulfill(json({ settings: s3StorageSettings }));
      return;
    }

    if (path.startsWith("/admin/storage/s3/objects")) {
      await route.fulfill(json({ prefix: url.searchParams.get("prefix") ?? "", objects: [s3StorageObject], nextCursor: null }));
      return;
    }

    if (path === "/admin/mailings/preview") {
      await route.fulfill(
        json({
          targetCount: 8,
          excludedBotBlocked: 0,
          excludedByFilters: 2,
          estimatedSeconds: 12,
          estimatedLabel: "около 12 секунд"
        })
      );
      return;
    }

    if (path === "/community/topics") {
      await route.fulfill(
        json({
          topics: [
            {
              id: "topic-fix",
              chatId: "chat-main",
              title: "Фиксики",
              description: "Проверочный чат",
              isPinned: false,
              isLocked: false,
              isPublished: true,
              archivedUntil: null,
              messagesCount: 2,
              latestReplyToMeAt: null,
              createdAt: now
            }
          ]
        })
      );
      return;
    }

    if (path === "/community/topics/topic-fix/messages" && request.method() === "GET") {
      await route.fulfill(json(communityMessagesResponse()));
      return;
    }

    if (path === "/community/topics/topic-fix/messages" && request.method() === "POST") {
      await route.fulfill(
        json({
          ok: true,
          message: {
            id: "message-created",
            topicId: "topic-fix",
            body: "Проверка адаптива",
            isSystem: false,
            status: "visible",
            author: ownAuthor,
            replyTo: null,
            likesCount: 0,
            dislikesCount: 0,
            reactionCounts: [],
            myReaction: null,
            authorMute: null,
            createdAt: now
          }
        })
      );
      return;
    }

    await route.fulfill(json({ ok: true }));
  };

  await page.route(`${apiBaseUrl}/**`, handleApiRoute);
  await page.route(appApiUrlPattern, handleApiRoute);
}

async function mockInstalledPwa(page: Page, testInfo: TestInfo) {
  await page.addInitScript((projectName) => {
    if (projectName === "android-standalone-no-touch-980") {
      Object.defineProperty(window.screen, "width", { configurable: true, get: () => 385 });
      Object.defineProperty(window.screen, "height", { configurable: true, get: () => 833 });
      Object.defineProperty(window.screen, "availWidth", { configurable: true, get: () => 385 });
      Object.defineProperty(window.screen, "availHeight", { configurable: true, get: () => 833 });
      Object.defineProperty(window, "devicePixelRatio", { configurable: true, get: () => 3.75 });
      Object.defineProperty(navigator, "platform", { configurable: true, get: () => "Linux armv81" });
      Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, get: () => 0 });
    }

    const originalMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query: string) => {
      if (query === "(display-mode: standalone)") {
        return {
          matches: true,
          media: query,
          onchange: null,
          addEventListener() {},
          removeEventListener() {},
          addListener() {},
          removeListener() {},
          dispatchEvent() {
            return false;
          }
        } as MediaQueryList;
      }

      return originalMatchMedia(query);
    };
  }, testInfo.project.name);
}

async function openApp(page: Page, testInfo: TestInfo) {
  await mockInstalledPwa(page, testInfo);
  await mockApi(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Профиль" }).first()).toBeVisible();
}

async function continuePastDeviceNotice(page: Page) {
  const continueButton = page.getByRole("button", { name: /Всё равно продолжить|Continue anyway/ });
  if (await continueButton.isVisible().catch(() => false)) {
    await continueButton.click();
  }
}

async function expectNoHorizontalOverflow(page: Page, rootSelector?: string) {
  const overflow = await page.evaluate((selector) => {
    const viewportWidth = document.documentElement.clientWidth;
    const scrollWidth = document.documentElement.scrollWidth;
    const root = selector ? document.querySelector<HTMLElement>(selector) : document.body;
    const candidates = root ? [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))] : [];
    const offenders = candidates
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          className: String(element.className),
          text: (element.textContent ?? "").trim().slice(0, 40),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width)
        };
      })
      .filter((item) => item.width > 1 && (item.left < -2 || item.right > viewportWidth + 2))
      .slice(0, 8);

    return { viewportWidth, scrollWidth, offenders };
  }, rootSelector);

  expect(overflow.scrollWidth, JSON.stringify(overflow, null, 2)).toBeLessThanOrEqual(overflow.viewportWidth + 2);
  expect(overflow.offenders, JSON.stringify(overflow, null, 2)).toEqual([]);
}

async function expectConsistentIconActionTargets(page: Page, context: string, selector: string) {
  const issues = await page.locator(selector).evaluateAll((elements, auditContext) => {
    const isScaledShell = document.documentElement.classList.contains("club-mobile-app-scaled");
    const shellScale = isScaledShell
      ? Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--club-app-wide-viewport-scale")) || 1
      : 1;
    const subpixelTolerance = 0.5;

    return elements
      .map((element) => {
        const target = element as HTMLElement;
        const rect = target.getBoundingClientRect();
        const style = getComputedStyle(target);
        const targetToken = style.getPropertyValue("--icon-button-size").trim();
        const iconToken = style.getPropertyValue("--icon-size").trim();
        const minimumTargetSize = 44;
        const maximumTargetSize = 48;
        const minimumIconSize = 16;
        const maximumIconSize = 18;
        const svg = target.querySelector<SVGElement>("svg");
        const svgRect = svg?.getBoundingClientRect();
        const effectiveWidth = rect.width / shellScale;
        const effectiveHeight = rect.height / shellScale;
        const effectiveSvgWidth = svgRect ? svgRect.width / shellScale : null;
        const effectiveSvgHeight = svgRect ? svgRect.height / shellScale : null;
        const label = target.getAttribute("aria-label") ?? target.getAttribute("title") ?? (target.textContent ?? "").trim().replace(/\s+/g, " ");
        const isTextAction = !svg && label.length > 0;
        const isVisible =
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0";

        return {
          context: auditContext,
          tag: target.tagName.toLowerCase(),
          className: String(target.className),
          label,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          svgWidth: svgRect ? Math.round(svgRect.width) : null,
          svgHeight: svgRect ? Math.round(svgRect.height) : null,
          effectiveWidth: Math.round(effectiveWidth),
          effectiveHeight: Math.round(effectiveHeight),
          effectiveSvgWidth: effectiveSvgWidth === null ? null : Math.round(effectiveSvgWidth),
          effectiveSvgHeight: effectiveSvgHeight === null ? null : Math.round(effectiveSvgHeight),
          minWidth: style.minWidth,
          minHeight: style.minHeight,
          whiteSpace: style.whiteSpace,
          display: style.display,
          visible: isVisible,
          minimumTargetSize,
          maximumTargetSize,
          minimumIconSize,
          maximumIconSize,
          targetToken,
          iconToken,
          isScaledShell,
          shellScale,
          hasSmallTarget: effectiveWidth + subpixelTolerance < minimumTargetSize || effectiveHeight + subpixelTolerance < minimumTargetSize,
          hasLargeTarget: effectiveWidth - subpixelTolerance > maximumTargetSize || effectiveHeight - subpixelTolerance > maximumTargetSize,
          hasNonSquareTarget: Math.abs(effectiveWidth - effectiveHeight) > 1,
          hasSmallIcon: Boolean(
            svgRect &&
              effectiveSvgWidth !== null &&
              effectiveSvgHeight !== null &&
              (effectiveSvgWidth + subpixelTolerance < minimumIconSize || effectiveSvgHeight + subpixelTolerance < minimumIconSize)
          ),
          hasLargeIcon: Boolean(
            svgRect &&
              effectiveSvgWidth !== null &&
              effectiveSvgHeight !== null &&
              (effectiveSvgWidth - subpixelTolerance > maximumIconSize || effectiveSvgHeight - subpixelTolerance > maximumIconSize)
          ),
          hasEscapedIcon: Boolean(
            svgRect &&
              (svgRect.left < rect.left - subpixelTolerance ||
                svgRect.top < rect.top - subpixelTolerance ||
                svgRect.right > rect.right + subpixelTolerance ||
                svgRect.bottom > rect.bottom + subpixelTolerance)
          ),
          hasWrappingTextAction:
            isTextAction &&
            (style.whiteSpace !== "nowrap" ||
              style.wordBreak === "break-word" ||
              style.overflowWrap === "anywhere" ||
              target.scrollWidth > target.clientWidth + 1 ||
              target.scrollHeight > target.clientHeight + 1)
        };
      })
      .filter(
        (item) =>
          item.visible &&
          (item.hasSmallTarget ||
            item.hasLargeTarget ||
            item.hasNonSquareTarget ||
            item.hasSmallIcon ||
            item.hasLargeIcon ||
            item.hasEscapedIcon ||
            item.hasWrappingTextAction)
      );
  }, context);

  expect(issues, `${context}\n${JSON.stringify(issues, null, 2)}`).toEqual([]);
}

const iconActionControlSelector = [
  ".ui-icon-button",
  ".notification-center-button",
  ".compact-controls > button",
  ".profile-avatar-icon-button",
  ".support-file-icon-button",
  ".visual-scale-step-button",
  ".module-sort-button",
  ".module-lesson-add",
  ".payment-product-admin-actions .icon-button",
  ".chat-input-row .icon-button"
].join(", ");

async function expectProfileActionButtonsUseScaledFoundation(page: Page) {
  const issues = await page.locator(".profile-access-actions .ui-button").evaluateAll((elements) => {
    const isScaledShell = document.documentElement.classList.contains("club-mobile-app-scaled");
    const shellScale = isScaledShell
      ? Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--club-app-wide-viewport-scale")) || 1
      : 1;
    const minimumButtonHeight = 44;
    const maximumButtonHeight = 52;
    const subpixelTolerance = 0.5;

    return elements
      .map((element) => {
        const target = element as HTMLElement;
        const rect = target.getBoundingClientRect();
        const style = getComputedStyle(target);
        const effectiveHeight = rect.height / shellScale;

        return {
          className: String(target.className),
          label: (target.textContent ?? "").trim().replace(/\s+/g, " "),
          height: Math.round(rect.height),
          effectiveHeight: Math.round(effectiveHeight),
          minimumButtonHeight,
          maximumButtonHeight,
          isScaledShell,
          shellScale,
          minHeight: style.minHeight,
          visible: rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden",
          hasSmallHeight: effectiveHeight + subpixelTolerance < minimumButtonHeight,
          hasLargeHeight: effectiveHeight - subpixelTolerance > maximumButtonHeight
        };
      })
      .filter((item) => item.visible && (item.hasSmallHeight || item.hasLargeHeight));
  });

  expect(issues, `profile access action buttons\n${JSON.stringify(issues, null, 2)}`).toEqual([]);
}

async function expectChatComposerCompactRow(page: Page) {
  const layout = await page.evaluate(() => {
    const row = document.querySelector<HTMLElement>(".community-chat-open .chat-input-row");
    const room = document.querySelector<HTMLElement>(".community-chat-open .chat-room");
    const composer = document.querySelector<HTMLElement>(".community-chat-open .chat-compose");
    const messages = document.querySelector<HTMLElement>(".community-chat-open .chat-messages");
    const input = row?.querySelector<HTMLElement>(".text-input") ?? null;
    const buttons = Array.from(row?.querySelectorAll<HTMLElement>(".icon-button") ?? []);
    const isScaledShell = document.documentElement.classList.contains("club-mobile-app-scaled");
    const shellScale = isScaledShell
      ? Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--club-app-wide-viewport-scale")) || 1
      : 1;
    const rowRect = row?.getBoundingClientRect();
    const roomRect = room?.getBoundingClientRect();
    const roomStyle = room ? getComputedStyle(room) : null;
    const composerRect = composer?.getBoundingClientRect();
    const inputRect = input?.getBoundingClientRect();
    const inputStyle = input ? getComputedStyle(input) : null;
    const buttonRects = buttons.map((button) => {
      const rect = button.getBoundingClientRect();
      const svg = button.querySelector<SVGElement>("svg");
      const svgRect = svg?.getBoundingClientRect();
      return {
        label: button.getAttribute("aria-label") ?? "",
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        svgWidth: svgRect ? Math.round(svgRect.width) : null,
        svgHeight: svgRect ? Math.round(svgRect.height) : null,
        effectiveWidth: Math.round(rect.width / shellScale),
        effectiveHeight: Math.round(rect.height / shellScale),
        effectiveSvgWidth: svgRect ? Math.round(svgRect.width / shellScale) : null,
        effectiveSvgHeight: svgRect ? Math.round(svgRect.height / shellScale) : null
      };
    });

    if (messages) {
      messages.scrollTop = messages.scrollHeight;
    }

    const visibleViewportHeight = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--club-visible-viewport-height")) || window.innerHeight;

    return {
      display: row ? getComputedStyle(row).display : null,
      roomHeight: roomRect ? Math.round(roomRect.height) : null,
      roomTop: roomRect ? Math.round(roomRect.top) : null,
      roomBottom: roomRect ? Math.round(roomRect.bottom) : null,
      roomBoxSizing: roomStyle?.boxSizing ?? null,
      roomPaddingBottom: roomStyle?.paddingBottom ?? null,
      rowHeight: rowRect ? Math.round(rowRect.height) : null,
      effectiveRowHeight: rowRect ? Math.round(rowRect.height / shellScale) : null,
      composerHeight: composerRect ? Math.round(composerRect.height) : null,
      effectiveComposerHeight: composerRect ? Math.round(composerRect.height / shellScale) : null,
      composerTop: composerRect ? Math.round(composerRect.top) : null,
      composerBottom: composerRect ? Math.round(composerRect.bottom) : null,
      visibleViewportHeight: Math.round(visibleViewportHeight),
      inputHeight: inputRect ? Math.round(inputRect.height) : null,
      effectiveInputHeight: inputRect ? Math.round(inputRect.height / shellScale) : null,
      inputFontSize: inputStyle ? Number.parseFloat(inputStyle.fontSize) : null,
      effectiveInputFontSize: inputStyle ? Number.parseFloat(inputStyle.fontSize) / shellScale : null,
      messagesClientHeight: messages?.clientHeight ?? null,
      messagesScrollHeight: messages?.scrollHeight ?? null,
      messagesScrollTop: messages?.scrollTop ?? null,
      buttonRects,
      sameRow:
        Boolean(inputRect) &&
        buttonRects.length === 3 &&
        buttonRects.every((rect) => Math.abs(rect.top - Math.round(inputRect!.top)) <= 8),
      isScaledShell,
      shellScale,
      buttonsUsable: buttonRects.length === 3 && buttonRects.every((rect) => rect.effectiveWidth >= 44 && rect.effectiveHeight >= 44),
      iconsReadable: buttonRects.length === 3 && buttonRects.every((rect) => (rect.effectiveSvgWidth ?? 0) >= 16 && (rect.effectiveSvgHeight ?? 0) >= 16),
      messagesScrollableWhenOverflowing: Boolean(
        messages && (messages.scrollHeight <= messages.clientHeight + 4 || messages.scrollTop > 0)
      ),
      composerWithinVisibleViewport: Boolean(
        composerRect && composerRect.top >= -1 && composerRect.bottom <= visibleViewportHeight + 1
      )
    };
  });

  expect(layout, JSON.stringify(layout, null, 2)).toMatchObject({
    display: "grid",
    sameRow: true,
    buttonsUsable: true,
    iconsReadable: true,
    messagesScrollableWhenOverflowing: true,
    composerWithinVisibleViewport: true
  });
  expect(layout.effectiveInputFontSize, JSON.stringify(layout, null, 2)).toBeGreaterThanOrEqual(16);
  expect(layout.effectiveInputHeight, JSON.stringify(layout, null, 2)).toBeGreaterThanOrEqual(44);
  expect(layout.effectiveRowHeight, JSON.stringify(layout, null, 2)).toBeLessThanOrEqual(72);
  expect(layout.effectiveComposerHeight, JSON.stringify(layout, null, 2)).toBeLessThanOrEqual(88);
}

async function expectResponsiveLayoutIntegrity(page: Page, routePath: string) {
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => null);
  await expect(page.locator(".app-root")).toBeVisible();

  const layout = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight;
    const significantSelector =
      "main, section, article, aside, header, footer, form, nav, button, a, input, textarea, select, [role='button'], [role='dialog'], .task-screen, .soft-card, .surface-card";
    const visibleElements = Array.from(document.body.querySelectorAll<HTMLElement>(significantSelector)).filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    });

    const describe = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      return {
        tag: element.tagName.toLowerCase(),
        className: String(element.className),
        text: (element.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 64),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    };

    const offscreen = visibleElements
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 1 && rect.height > 1 && rect.bottom > -1 && rect.top < viewportHeight + 1 && (rect.left < -2 || rect.right > viewportWidth + 2);
      })
      .map(describe)
      .slice(0, 10);

    const invalidSizes = visibleElements
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width < 0 || rect.height < 0 || Number.isNaN(rect.width) || Number.isNaN(rect.height);
      })
      .map(describe)
      .slice(0, 10);

    const smallButtons = Array.from(
      document.body.querySelectorAll<HTMLElement>(
        "button, a[role='button'], input[type='button'], input[type='submit'], input[type='range']"
      )
    )
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const isVisible = rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
        const isTinyIcon = element.classList.contains("icon-button") && rect.width <= 44 && rect.height >= 40;
        return isVisible && !isTinyIcon && rect.height < 44;
      })
      .map(describe)
      .slice(0, 10);

    const fixedPanels = Array.from(document.body.querySelectorAll<HTMLElement>(".bottom-nav, .task-screen-footer, .app-operation-indicator"))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          ...describe(element),
          position: style.position,
          withinViewport:
            rect.left >= -1 && rect.right <= viewportWidth + 1 && rect.top >= -1 && rect.bottom <= viewportHeight + 1
        };
      });

    return {
      viewportWidth,
      viewportHeight,
      documentScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      offscreen,
      invalidSizes,
      smallButtons,
      fixedPanels
    };
  });

  expect(layout.documentScrollWidth, `${routePath}\n${JSON.stringify(layout, null, 2)}`).toBeLessThanOrEqual(layout.viewportWidth + 2);
  expect(layout.bodyScrollWidth, `${routePath}\n${JSON.stringify(layout, null, 2)}`).toBeLessThanOrEqual(layout.viewportWidth + 2);
  expect(layout.offscreen, `${routePath}\n${JSON.stringify(layout, null, 2)}`).toEqual([]);
  expect(layout.invalidSizes, `${routePath}\n${JSON.stringify(layout, null, 2)}`).toEqual([]);
  expect(layout.smallButtons, `${routePath}\n${JSON.stringify(layout, null, 2)}`).toEqual([]);
  expect(
    layout.fixedPanels.filter((panel) => !panel.withinViewport),
    `${routePath}\n${JSON.stringify(layout, null, 2)}`
  ).toEqual([]);
}

async function expectRoutedTaskScreenFillsMobilePwaViewport(page: Page, routePath: string) {
  const metrics = await page.evaluate(() => {
    const layer = document.querySelector<HTMLElement>(".task-screen-route-layer");
    const taskScreen = document.querySelector<HTMLElement>(".task-screen-route-layer > .task-screen");
    const layerRect = layer?.getBoundingClientRect();
    const taskRect = taskScreen?.getBoundingClientRect();
    const describe = (rect: DOMRect | undefined) =>
      rect
        ? {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            right: Math.round(rect.right),
            bottom: Math.round(rect.bottom)
          }
        : null;

    return {
      viewportWidth: document.documentElement.clientWidth,
      isMobileDevicePwa: document.body.classList.contains("club-mobile-device"),
      layer: describe(layerRect),
      taskScreen: describe(taskRect)
    };
  });

  if (!metrics.isMobileDevicePwa || !metrics.taskScreen) {
    return;
  }

  expect(metrics.layer, `${routePath}\n${JSON.stringify(metrics, null, 2)}`).toMatchObject({
    x: 0,
    width: metrics.viewportWidth
  });
  expect(metrics.taskScreen.x, `${routePath}\n${JSON.stringify(metrics, null, 2)}`).toBeLessThanOrEqual(1);
  expect(metrics.taskScreen.width, `${routePath}\n${JSON.stringify(metrics, null, 2)}`).toBeGreaterThanOrEqual(
    metrics.viewportWidth - 2
  );
  expect(metrics.taskScreen.right, `${routePath}\n${JSON.stringify(metrics, null, 2)}`).toBeLessThanOrEqual(
    metrics.viewportWidth + 1
  );
}

async function forcePlainMobileDeviceShell(page: Page) {
  await page.evaluate(() => {
    document.documentElement.classList.add("club-mobile-device");
    document.body.classList.add("club-mobile-device");
    document.documentElement.classList.remove("club-mobile-app-scaled");
    document.body.classList.remove("club-mobile-app-scaled");
    for (const target of [document.documentElement, document.body]) {
      target.style.removeProperty("--club-app-wide-viewport-scale");
      target.style.removeProperty("--club-app-wide-font-root");
      target.style.removeProperty("--club-app-wide-font-base");
    }
  });
}

async function stripMobileDeviceShell(page: Page) {
  await page.evaluate(() => {
    for (const target of [document.documentElement, document.body]) {
      target.classList.remove("club-mobile-device", "club-mobile-app-scaled", "club-mobile-auth-scaled");
      target.style.removeProperty("--club-app-wide-viewport-scale");
      target.style.removeProperty("--club-auth-wide-viewport-scale");
      target.style.removeProperty("--club-app-wide-font-root");
      target.style.removeProperty("--club-app-wide-font-base");
    }
  });
}

async function expectKeyboardSafeIfFormRoute(page: Page, routePath: string) {
  const keyboardFieldSelector =
    "textarea:visible, input:not([type='hidden']):not([type='file']):not([type='checkbox']):not([type='radio']):not([type='range']):visible";
  const keyboardFieldCssSelector =
    "textarea, input:not([type='hidden']):not([type='file']):not([type='checkbox']):not([type='radio']):not([type='range'])";
  const taskFieldSelector = [
    `.task-screen-route-layer ${keyboardFieldSelector}`,
    `.support-task-screen ${keyboardFieldSelector}`,
    `.payment-task-screen ${keyboardFieldSelector}`,
    `.learning-task-screen ${keyboardFieldSelector}`,
    `.admin-mailing-task-screen ${keyboardFieldSelector}`
  ].join(", ");
  const taskScopeCssSelector = [
    ".task-screen-route-layer",
    ".support-task-screen",
    ".payment-task-screen",
    ".learning-task-screen",
    ".admin-mailing-task-screen"
  ].join(", ");
  const fieldState = await page.evaluate(
    ({ fieldSelector, taskScopeSelector }) => {
      const isVisible = (element: Element) => {
        if (!(element instanceof HTMLElement)) {
          return false;
        }
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      };
      const fields = Array.from(document.querySelectorAll<HTMLElement>(fieldSelector)).filter(isVisible);
      const taskScopes = Array.from(document.querySelectorAll<HTMLElement>(taskScopeSelector)).filter(isVisible);
      const taskFields = fields.filter((field) => taskScopes.some((scope) => scope.contains(field)));

      return {
        hasPortalTaskLayer: taskScopes.some((scope) => scope.classList.contains("task-screen-route-layer")),
        hasTaskField: taskFields.length > 0,
        hasAnyField: fields.length > 0
      };
    },
    { fieldSelector: keyboardFieldCssSelector, taskScopeSelector: taskScopeCssSelector }
  );

  if (!fieldState.hasTaskField && fieldState.hasPortalTaskLayer) {
    return;
  }
  if (!fieldState.hasTaskField && !fieldState.hasAnyField) {
    return;
  }

  const taskField = page
    .locator(taskFieldSelector)
    .first();
  const field = fieldState.hasTaskField ? taskField : page.locator(keyboardFieldSelector).first();
  const originalViewport = page.viewportSize();
  if (originalViewport && originalViewport.height > 420) {
    await page.setViewportSize({ width: originalViewport.width, height: 420 });
  }

  const applyKeyboardViewport = () =>
    page.evaluate(() => {
      document.documentElement.classList.add("club-keyboard-open");
      document.body.classList.add("club-keyboard-open");
      document.documentElement.style.setProperty("--club-visible-viewport-height", "420px");
      document.body.style.setProperty("--club-visible-viewport-height", "420px");
      document.documentElement.style.setProperty("--club-system-bottom", "360px");
      document.body.style.setProperty("--club-system-bottom", "360px");
      document.documentElement.style.setProperty("--club-calibrated-bottom-offset", "360px");
      document.body.style.setProperty("--club-calibrated-bottom-offset", "360px");
    });

  await applyKeyboardViewport();
  await field.scrollIntoViewIfNeeded();
  await field.focus();
  await applyKeyboardViewport();
  await page.evaluate(() => {
    window.setTimeout(() => {
      document.documentElement.classList.add("club-keyboard-open");
      document.body.classList.add("club-keyboard-open");
      document.documentElement.style.setProperty("--club-visible-viewport-height", "420px");
      document.body.style.setProperty("--club-visible-viewport-height", "420px");
      document.documentElement.style.setProperty("--club-system-bottom", "360px");
      document.body.style.setProperty("--club-system-bottom", "360px");
      document.documentElement.style.setProperty("--club-calibrated-bottom-offset", "360px");
      document.body.style.setProperty("--club-calibrated-bottom-offset", "360px");
    }, 420);
  });

  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          const activeRect = active?.getBoundingClientRect();
          const footer = document.querySelector<HTMLElement>(".task-screen-footer");
          return {
            active:
              active && activeRect
                ? {
                    tag: active.tagName.toLowerCase(),
                    top: Math.round(activeRect.top),
                    bottom: Math.round(activeRect.bottom),
                    height: Math.round(activeRect.height),
                    visibleInReducedViewport: activeRect.top >= -1 && activeRect.bottom <= 420
                  }
                : null,
            footerPosition: footer ? getComputedStyle(footer).position : null
          };
        }),
      { timeout: 2_500, message: routePath }
    )
    .toMatchObject({ active: { visibleInReducedViewport: true } });

  const finalKeyboardLayout = await page.evaluate(() => {
    const footer = document.querySelector<HTMLElement>(".task-screen-footer");
    return {
      footerPosition: footer ? getComputedStyle(footer).position : null
    };
  });
  if (finalKeyboardLayout.footerPosition) {
    expect(finalKeyboardLayout.footerPosition, `${routePath}\n${JSON.stringify(finalKeyboardLayout, null, 2)}`).not.toBe("fixed");
  }

  await page.evaluate(() => {
    document.documentElement.classList.remove("club-keyboard-open");
    document.body.classList.remove("club-keyboard-open");
    for (const name of ["--club-visible-viewport-height", "--club-system-bottom", "--club-calibrated-bottom-offset"]) {
      document.documentElement.style.removeProperty(name);
      document.body.style.removeProperty(name);
    }
  });
  if (originalViewport) {
    await page.setViewportSize(originalViewport);
  }
}

const mobileModalFixtures = [
  { backdropClass: "admin-modal-backdrop", modalClass: "admin-detail admin-client-modal" },
  { backdropClass: "payment-modal-backdrop", modalClass: "admin-detail admin-client-modal payment-form-modal" },
  { backdropClass: "support-modal-backdrop", modalClass: "admin-detail admin-client-modal support-ticket-modal" },
  { backdropClass: "admin-modal-backdrop", modalClass: "admin-detail admin-client-modal lesson-preview-modal" },
  { backdropClass: "admin-modal-backdrop", modalClass: "admin-detail admin-client-modal module-name-modal" },
  { backdropClass: "profile-modal-backdrop", modalClass: "profile-avatar-editor-modal" },
  { backdropClass: "profile-modal-backdrop", modalClass: "profile-logout-confirm" },
  { backdropClass: "notification-center-backdrop", modalClass: "notification-center-panel" },
  { backdropClass: "admin-modal-backdrop", modalClass: "admin-detail admin-client-modal release-notes-modal" },
  { backdropClass: "admin-modal-backdrop", modalClass: "admin-detail admin-client-modal admin-mailing-composer-modal" },
  { backdropClass: "admin-modal-backdrop", modalClass: "admin-detail admin-client-modal admin-mailing-detail-modal" },
  { backdropClass: "admin-modal-backdrop", modalClass: "admin-detail admin-client-modal admin-storage-modal" },
  { backdropClass: "admin-modal-backdrop", modalClass: "admin-detail admin-client-modal admin-storage-modal admin-storage-folder-modal" },
  { backdropClass: "admin-modal-backdrop", modalClass: "admin-detail admin-client-modal admin-payment-drilldown-modal" },
  { backdropClass: "admin-modal-backdrop", modalClass: "admin-detail admin-client-modal admin-server-logs-modal" },
  { backdropClass: "admin-modal-backdrop", modalClass: "admin-detail admin-client-modal admin-permission-modal" },
  { backdropClass: "payment-modal-backdrop", modalClass: "payment-confirm-card" },
  { backdropClass: "push-permission-layer", modalClass: "push-permission-card" },
  { backdropClass: "admin-modal-backdrop", modalClass: "admin-detail admin-client-modal admin-client-message-modal" }
];

const compactMobileModalClasses = [
  "module-name-modal",
  "profile-logout-confirm",
  "notification-center-panel",
  "release-notes-modal",
  "payment-confirm-card",
  "push-permission-card"
];

async function renderMobileModalFixture(page: Page, fixture: { backdropClass: string; modalClass: string }) {
  await page.evaluate(({ backdropClass, modalClass }) => {
    document.getElementById("modal-fixture")?.remove();
    document.documentElement.classList.add("club-mobile-device");
    document.body.classList.add("club-mobile-device");

    const backdrop = document.createElement("div");
    backdrop.id = "modal-fixture";
    backdrop.className = fixtureBackdropClass(backdropClass);

    const modal = document.createElement("aside");
    modal.className = modalClass;
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-label", "Проверочная модалка");
    modal.setAttribute("data-modal-fixture-panel", "true");
    modal.innerHTML = `
      <header class="admin-client-modal-head notification-center-head">
        <div>
          <h3>Проверочная модалка</h3>
          <p>Длинный текст должен переноситься и не растягивать окно за пределы экрана.</p>
        </div>
        <button type="button" class="icon-button">×</button>
      </header>
      <div class="admin-client-summary admin-client-profile-grid admin-access-toggle notification-center-actions push-permission-actions" style="padding: 1rem; gap: .6rem;">
        <button type="button" class="admin-date-action notification-center-clear push-permission-enable">Очень длинное действие</button>
        <button type="button" class="admin-date-save push-permission-later">Сохранить</button>
        <button type="button" class="admin-message-client-button">Написать участнику</button>
      </div>
      <div class="notification-center-list">
        <article class="notification-center-item soft-card">
          <header>
            <strong>Ответ поддержки</strong>
            <time>07.07, 21:14</time>
          </header>
          <p>Контент внутри модалки тоже не должен создавать горизонтальный скролл.</p>
        </article>
      </div>
    `;

    backdrop.append(modal);
    document.body.append(backdrop);

    function fixtureBackdropClass(value: string) {
      return value;
    }
  }, fixture);
}

async function expectMobileModalFitsViewport(page: Page, testInfo: TestInfo, fixture: { modalClass: string }) {
  const panel = page.locator("[data-modal-fixture-panel]");
  await expect(panel).toBeVisible();

  const box = await panel.boundingBox();
  const viewport = page.viewportSize();
  expect(box, fixture.modalClass).not.toBeNull();
  expect(viewport, fixture.modalClass).not.toBeNull();

  const modalBox = box!;
  const viewportSize = viewport!;
  const minWidth =
    testInfo.project.name === "android-wide-layout-980"
      ? viewportSize.width * 0.88
      : Math.min(viewportSize.width * 0.82, 560);

  expect(modalBox.x, fixture.modalClass).toBeGreaterThanOrEqual(0);
  expect(modalBox.width, fixture.modalClass).toBeGreaterThanOrEqual(minWidth);
  expect(modalBox.x + modalBox.width, fixture.modalClass).toBeLessThanOrEqual(viewportSize.width + 1);
  if (compactMobileModalClasses.some((className) => fixture.modalClass.includes(className))) {
    expect(modalBox.height, fixture.modalClass).toBeLessThan(viewportSize.height * 0.98);
  }
  await expect
    .poll(() =>
      page.evaluate(() => {
        const backdrop = document.getElementById("modal-fixture");
        const modal = document.querySelector<HTMLElement>("[data-modal-fixture-panel]");
        return {
          backdropTouchAction: backdrop ? getComputedStyle(backdrop).touchAction : "",
          modalTouchAction: modal ? getComputedStyle(modal).touchAction : ""
        };
      })
    )
    .toEqual({ backdropTouchAction: "pan-y", modalTouchAction: "pan-y" });
  await expectNoHorizontalOverflow(page, "[data-modal-fixture-panel]");
}

async function expectPwaTopEdgeClear(
  page: Page,
  selector: string,
  options: { minY?: number; maxY?: number } = {}
) {
  const target = page.locator(selector).first();
  await expect(target).toBeVisible();

  const targetBox = await target.boundingBox();
  const y = targetBox?.y ?? 0;
  expect(y).toBeGreaterThanOrEqual(options.minY ?? 0);
  if (options.maxY !== undefined) {
    expect(y).toBeLessThanOrEqual(options.maxY);
  }
}

function isFullVisualRun(testInfo: TestInfo) {
  return testInfo.config.configFile.endsWith("playwright.full.config.ts");
}

async function expectStableScreenshot(page: Page, name: string) {
  await expect(page).toHaveScreenshot(`${name}.png`, {
    animations: "disabled",
    caret: "hide",
    fullPage: false,
    maxDiffPixelRatio: 0.01
  });
}

test.beforeEach(async ({ page }, testInfo) => {
  await openApp(page, testInfo);
});

const responsiveRouteAuditProjects = new Set([
  "android-compact-320",
  "oneplus-mt2111",
  "viewport-390-844",
  "viewport-412-915",
  "android-wide-480",
  "android-landscape-844-390",
  "yandex-android-390-844",
  "ios-safari-webkit",
  "tablet-768-1024"
]);
const wideMobilePwaRouteAuditProjects = new Set(["android-wide-layout-980", "android-standalone-no-touch-980"]);

test("shows a clear learning path with progress and lesson navigation", async ({ page }, testInfo) => {
  const member = { ...currentUser, role: "member", realRole: "member", adminPermissions: [] };
  const lessons = [
    { ...adminLearningMaterial, id: "lesson-path-1", title: "Первый урок", categoryId: "module-path", kind: "text", mediaUrl: null, mediaSource: null, cardLayout: "vertical" },
    { ...adminLearningMaterial, id: "lesson-path-2", title: "Второй урок", categoryId: "module-path", kind: "text", mediaUrl: null, mediaSource: null, cardLayout: "vertical" }
  ];
  await page.route("**/api/me", (route) => route.fulfill(json({ user: member })));
  await page.route("**/api/learning", (route) => route.fulfill(json({
    categories: [{ ...adminLearningCategory, id: "module-path", title: "Маршрут", itemsCount: 2 }],
    featured: lessons,
    progress: { totalItems: 2, completedItems: 1, startedItemIds: ["lesson-path-1", "lesson-path-2"], completedItemIds: ["lesson-path-1"], lastOpenedItem: null, lastOpenedMaterialId: null, lastOpenedAt: null, lastOpenedPlaybackPositionSeconds: 0 }
  })));
  await page.route("**/api/learning/items/*", async (route) => {
    const id = new URL(route.request().url()).pathname.split("/").at(-1);
    const item = lessons.find((lesson) => lesson.id === id) ?? lessons[0];
    await route.fulfill(json({ item: { ...item, body: `Содержимое: ${item.title}` }, completedAt: item.id === "lesson-path-1" ? now : null, lastOpenedMaterialId: null, playbackPositionSeconds: 0 }));
  });
  await page.reload();
  await page.getByRole("button", { name: "Модули" }).click();

  await expect(page.getByText("Ваш прогресс")).toBeVisible();
  await expect(page.getByText("1 из 2 уроков").first()).toBeVisible();
  await page.getByRole("button", { name: "Развернуть Маршрут" }).click();
  await expect(page.getByText("Пройден")).toBeVisible();
  await expect(page.getByText("В процессе")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("learning-path-overview.png"), fullPage: false });
  await page.getByRole("button", { name: "Открыть урок Первый урок" }).click();
  await page.getByRole("button", { name: "Следующий урок" }).click();
  await expect(page.getByRole("heading", { name: "Второй урок" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("learning-path.png"), fullPage: false });
});

const exactMobileAuditViewports = [
  { name: "320x568", width: 320, height: 568 },
  { name: "360x640", width: 360, height: 640 },
  { name: "375x667", width: 375, height: 667 },
  { name: "390x844", width: 390, height: 844 },
  { name: "412x915", width: 412, height: 915 },
  { name: "768x1024", width: 768, height: 1024 }
];

const exactDesktopAuditViewports = [
  { name: "1024x768", width: 1024, height: 768 },
  { name: "1280x720", width: 1280, height: 720 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1920x1080", width: 1920, height: 1080 }
];

const responsiveRouteAuditPaths = [
  { path: "/profile", selector: ".soft-home" },
  { path: "/profile/avatar", selector: ".profile-avatar-editor-modal" },
  { path: "/notifications", selector: ".notification-task-screen .task-screen" },
  { path: "/learning", selector: ".modules-section" },
  { path: "/learning/modules/new", selector: ".learning-task-screen .task-screen" },
  { path: "/learning/modules/module-main/edit", selector: ".learning-task-screen .task-screen" },
  { path: "/learning/lessons/new/module-main", selector: ".learning-task-screen .task-screen" },
  { path: "/learning/lessons/lesson-admin-1", selector: ".learning-task-screen .task-screen" },
  { path: "/learning/lessons/lesson-admin-1/edit", selector: ".learning-task-screen .task-screen" },
  { path: "/community", selector: ".community-chat-shell" },
  { path: "/payments", selector: ".payment-product-list, .surface-card" },
  { path: `/payments/offers/${individualOfferToken}`, selector: ".offer-card" },
  { path: "/payments/provider", selector: ".payment-task-screen .task-screen" },
  { path: "/payments/plans/new", selector: ".payment-task-screen .task-screen" },
  { path: "/payments/plans/product-30/edit", selector: ".payment-task-screen .task-screen" },
  { path: "/support", selector: ".support-section" },
  { path: "/support/new", selector: ".support-task-screen .task-screen" },
  { path: "/support/tickets/ticket-payment", selector: ".support-task-screen .task-screen" },
  { path: "/admin", selector: ".admin-shell" },
  { path: "/admin/clients/593677751", selector: ".admin-task-screen .task-screen" },
  { path: "/admin/statistics/payments/paid", selector: ".admin-task-screen .task-screen" },
  { path: "/admin/statistics/users/access-inactive", selector: ".admin-task-screen .task-screen" },
  { path: "/admin/statistics/users/tariff-manual", selector: ".admin-task-screen .task-screen" },
  { path: "/admin/releases", selector: ".release-notes-modal" },
  { path: "/admin/mailings/new", selector: ".admin-mailing-task-screen .task-screen" },
  { path: "/admin/mailings/history", selector: ".admin-mailing-history-task-screen .task-screen" },
  { path: "/admin/mailings/mailing-demo", selector: ".admin-task-screen .task-screen" },
  { path: "/admin/storage/files", selector: ".admin-task-screen .task-screen" },
  { path: "/admin/storage/folders/all", selector: ".admin-task-screen .task-screen" },
  { path: "/admin/storage/settings", selector: ".admin-task-screen .task-screen" },
  { path: "/admin/server/logs", selector: ".admin-task-screen .task-screen" },
  { path: "/admin/owner/transfer", selector: ".admin-task-screen .task-screen" },
  { path: "/admin/admins/admin-owner/access", selector: ".admin-task-screen .task-screen" }
];

test("renders the PWA shell without accessibility violations", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Профиль" })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => ({
        hasTelegramRuntime: "Telegram" in window,
        hasTelegramClass: [...document.documentElement.classList, ...document.body.classList].some((className) =>
          className.includes("telegram")
        )
      }))
    )
    .toEqual({ hasTelegramRuntime: false, hasTelegramClass: false });

  await page.addScriptTag({
    content: readFileSync(require.resolve("axe-core/axe.min.js"), "utf8")
  });

  const results = await page.evaluate(async () => {
    return window.axe.run(document, {
      rules: {
        "color-contrast": { enabled: false },
        "meta-viewport": { enabled: false }
      }
    });
  });

  expect(results.violations).toEqual([]);
});

test("keeps core sections inside the mobile viewport", async ({ page }, testInfo) => {
  await expectNoHorizontalOverflow(page);

  for (const section of ["Модули", "Общение", "Оплата", "Поддержка"]) {
    await page.getByRole("button", { name: section }).click();
    await expect(page.getByRole("heading", { name: section }).first()).toBeVisible();
    if (section === "Оплата") {
      const tariffActions = page.locator(".payment-product-pay");
      await expect(tariffActions).toHaveCount(3);
      for (let index = 0; index < 3; index += 1) {
        await expect(tariffActions.nth(index)).toHaveText("Оплатить");
      }
      await expect(page.getByRole("button", { name: "Оформить подписку" })).toHaveCount(0);
      if (testInfo.project.name === "release-android") {
        await page.screenshot({ path: testInfo.outputPath("payment-unified-actions.png"), fullPage: false });
      }
    }
    if (section === "Поддержка") {
      const supportLayout = await page.locator(".support-admin-board").evaluate((board) => {
        const stats = board.querySelector<HTMLElement>(".support-admin-stats");
        const firstMetric = stats?.querySelector<HTMLElement>(".support-stat") ?? null;
        const firstMetricStyle = firstMetric ? getComputedStyle(firstMetric) : null;
        const ticket = board.querySelector<HTMLElement>(".support-admin-ticket");
        const ticketStyle = ticket ? getComputedStyle(ticket) : null;
        const markerStyle = ticket ? getComputedStyle(ticket, "::before") : null;
        return {
          metricCount: stats?.children.length ?? 0,
          metricColumns: stats ? getComputedStyle(stats).gridTemplateColumns.split(" ").length : 0,
          wideStats: window.matchMedia("(min-width: 620px)").matches,
          statsRadius: stats ? getComputedStyle(stats).borderRadius : "",
          statsBackground: stats ? getComputedStyle(stats).backgroundColor : "",
          metricRadius: firstMetricStyle?.borderRadius ?? "",
          metricBorder: firstMetricStyle?.borderTopWidth ?? "",
          metricBackground: firstMetricStyle?.backgroundColor ?? "",
          normalizedTicketHeight:
            ticket && Number.parseFloat(getComputedStyle(document.documentElement).fontSize) > 0
              ? (ticket.offsetHeight * 16) / Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
              : 0,
          ticketRadius: ticketStyle?.borderRadius ?? "",
          ticketBorder: ticketStyle?.borderTopWidth ?? "",
          ticketBackground: ticketStyle?.backgroundColor ?? "",
          markerWidth: markerStyle?.width ?? "",
          hasChevron: Boolean(ticket?.querySelector(".support-admin-ticket-chevron"))
        };
      });
      expect(supportLayout.metricCount).toBe(4);
      expect(supportLayout.metricColumns).toBe(supportLayout.wideStats ? 4 : 2);
      expect(supportLayout.statsRadius).toBe("0px");
      expect(supportLayout.statsBackground).toBe("rgba(0, 0, 0, 0)");
      expect(supportLayout.metricRadius).toBe("8px");
      expect(supportLayout.metricBorder).toBe("1px");
      expect(supportLayout.metricBackground).not.toBe("rgba(0, 0, 0, 0)");
      expect(supportLayout.normalizedTicketHeight).toBeGreaterThanOrEqual(60);
      expect(supportLayout.normalizedTicketHeight).toBeLessThanOrEqual(96);
      expect(supportLayout.ticketRadius).toBe("8px");
      expect(supportLayout.ticketBorder).toBe("1px");
      expect(supportLayout.ticketBackground).not.toBe("rgba(0, 0, 0, 0)");
      expect(supportLayout.markerWidth).toBe("3px");
      expect(supportLayout.hasChevron).toBe(true);
      if (testInfo.project.name === "release-android") {
        await page.screenshot({ path: testInfo.outputPath("support-polished-overview.png"), fullPage: false });
      }
    }
    await expectNoHorizontalOverflow(page);
  }

  await page.goto("/profile");
  await page.getByRole("button", { name: /Реферальная система/ }).click();
  const profileDetail = page.locator(".profile-detail-task-screen .profile-detail-content");
  await expect(profileDetail).toBeVisible();
  const profileDetailGeometry = await page.locator(".profile-detail-task-screen .task-screen-body").evaluate((body) => {
    const content = body.querySelector<HTMLElement>(".profile-detail-content");
    const bodyStyle = getComputedStyle(body);
    const bodyBox = body.getBoundingClientRect();
    const contentBox = content?.getBoundingClientRect();
    return {
      availableWidth: bodyBox.width - Number.parseFloat(bodyStyle.paddingLeft) - Number.parseFloat(bodyStyle.paddingRight),
      contentWidth: contentBox?.width ?? 0
    };
  });
  expect(Math.abs(profileDetailGeometry.availableWidth - profileDetailGeometry.contentWidth)).toBeLessThanOrEqual(1);
  await expectNoHorizontalOverflow(page);
  if (testInfo.project.name === "release-android") {
    await page.screenshot({ path: testInfo.outputPath("profile-referral-full-width.png"), fullPage: false });
  }

  await page.goto("/profile");
  await page.getByRole("button", { name: /Оформление/ }).click();
  const appearanceDetail = page.locator(".profile-detail-task-screen .profile-appearance-content");
  await expect(appearanceDetail).toBeVisible();
  const appearanceGeometry = await appearanceDetail.evaluate((content) => {
    const body = content.closest<HTMLElement>(".task-screen-body");
    const bodyStyle = body ? getComputedStyle(body) : null;
    const bodyBox = body?.getBoundingClientRect();
    return {
      availableWidth:
        (bodyBox?.width ?? 0) -
        Number.parseFloat(bodyStyle?.paddingLeft ?? "0") -
        Number.parseFloat(bodyStyle?.paddingRight ?? "0"),
      contentWidth: content.getBoundingClientRect().width
    };
  });
  expect(Math.abs(appearanceGeometry.availableWidth - appearanceGeometry.contentWidth)).toBeLessThanOrEqual(1);
  await expectNoHorizontalOverflow(page);
  if (testInfo.project.name === "release-android") {
    await page.screenshot({ path: testInfo.outputPath("profile-appearance-full-width.png"), fullPage: false });
  }

  await page.goto("/learning/modules/module-main/edit");
  const visibilityAction = page.getByRole("button", { name: "Скрыть модуль" });
  await expect(visibilityAction).toBeVisible();
  await expect(visibilityAction).toHaveAttribute("aria-pressed", "true");
  const nativeContextMenuPolicy = await page.locator(".learning-task-screen").evaluate((screen) => {
    const action = screen.querySelector<HTMLElement>(".module-editor-visibility");
    const input = screen.querySelector<HTMLInputElement>("input");
    const actionMenu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    const inputMenu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    action?.dispatchEvent(actionMenu);
    input?.dispatchEvent(inputMenu);
    return {
      actionPrevented: actionMenu.defaultPrevented,
      inputPrevented: inputMenu.defaultPrevented
    };
  });
  expect(nativeContextMenuPolicy).toEqual({ actionPrevented: true, inputPrevented: false });
  const moduleHeaderGeometry = await page.locator(".learning-task-screen .task-screen-header").evaluate((header) => {
    const back = header.querySelector<HTMLElement>(".ui-page-header__back")?.getBoundingClientRect();
    const heading = header.querySelector<HTMLElement>(".ui-page-header__text")?.getBoundingClientRect();
    const headerBox = header.getBoundingClientRect();
    return {
      headerLeft: headerBox.left,
      headerRight: headerBox.right,
      backLeft: back?.left ?? -1,
      backRight: back?.right ?? -1,
      headingLeft: heading?.left ?? -1,
      headingRight: heading?.right ?? -1
    };
  });
  expect(moduleHeaderGeometry.backLeft).toBeGreaterThanOrEqual(moduleHeaderGeometry.headerLeft);
  expect(moduleHeaderGeometry.headingLeft).toBeGreaterThanOrEqual(moduleHeaderGeometry.backRight);
  expect(moduleHeaderGeometry.headingRight).toBeLessThanOrEqual(moduleHeaderGeometry.headerRight);
  const visibilityBox = await visibilityAction.boundingBox();
  const viewport = page.viewportSize();
  expect((visibilityBox?.y ?? 0) + (visibilityBox?.height ?? 0)).toBeLessThanOrEqual(viewport?.height ?? 0);
  await visibilityAction.click();
  await expect(page.getByRole("button", { name: "Опубликовать модуль" })).toHaveAttribute("aria-pressed", "false");
  await expectNoHorizontalOverflow(page);
  if (testInfo.project.name === "release-android") {
    await page.screenshot({ path: testInfo.outputPath("module-editor-visibility.png"), fullPage: false });
  }

  await page.goto("/support");
  await expect(page.getByRole("heading", { name: "Запросы клиентов" })).toBeVisible();
  const supportRows = page.locator(".support-admin-ticket");
  await expect(supportRows.first()).toBeVisible();
  const supportRowStyle = await supportRows.first().evaluate((row) => {
    const style = getComputedStyle(row);
    const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
    return {
      normalizedHeight: rootFontSize > 0 ? (row.getBoundingClientRect().height * 16) / rootFontSize : 0,
      borderRadius: style.borderRadius,
      borderBottomWidth: style.borderBottomWidth
    };
  });
  expect(supportRowStyle.normalizedHeight).toBeLessThanOrEqual(96);
  expect(supportRowStyle.borderRadius).toBe("8px");
  expect(supportRowStyle.borderBottomWidth).toBe("1px");
  await expectNoHorizontalOverflow(page);
  if (testInfo.project.name === "release-android") {
    await page.screenshot({ path: testInfo.outputPath("support-compact-rows.png"), fullPage: false });
  }
});

test("uses compact edge gutters and keeps the unread bell intact", async ({ page }, testInfo) => {
  test.skip(!["viewport-390-844", "android-wide-layout-980"].includes(testInfo.project.name));

  await page.route("**/api/app-state", async (route) => {
    await route.fulfill(
      json({
        access: {
          role: currentUser.role,
          realRole: currentUser.realRole,
          adminRoleLabel: currentUser.adminRoleLabel,
          adminPermissions: currentUser.adminPermissions,
          membershipStatus: currentUser.membershipStatus,
          membershipExpiresAt: currentUser.membershipExpiresAt,
          paymentType: currentUser.paymentType,
          recurrentPaymentStatus: currentUser.recurrentPaymentStatus,
          nextPaymentAt: currentUser.nextPaymentAt
        },
        notificationUnreadCount: 1,
        supportUnreadCount: 0
      })
    );
  });

  await page.route("**/api/notifications", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill(json({ notifications: [], unreadCount: 1 }));
      return;
    }
    await route.fallback();
  });

  const auditedViewports =
    testInfo.project.name === "android-wide-layout-980"
      ? [{ width: 980, height: 1914, gutter: 8 }]
      : [
          { width: 390, height: 844, gutter: 8 },
          { width: 320, height: 640, gutter: 4 }
        ];

  for (const viewport of auditedViewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/profile");

    const bell = page.locator(".notification-center-button");
    const badge = page.locator(".notification-center-badge");
    await expect(bell).toBeVisible();
    await expect(badge).toHaveText("1");

    const bellGeometry = await bell.evaluate((element) => {
      const button = element.getBoundingClientRect();
      const icon = element.querySelector("svg")?.getBoundingClientRect();
      const badgeElement = element.querySelector<HTMLElement>(".notification-center-badge");
      const badgeStyle = badgeElement ? getComputedStyle(badgeElement) : null;
      return {
        buttonWidth: button.width,
        buttonHeight: button.height,
        iconWidth: icon?.width ?? 0,
        iconHeight: icon?.height ?? 0,
        iconCenterDeltaX: icon ? Math.abs(icon.left + icon.width / 2 - (button.left + button.width / 2)) : 999,
        iconCenterDeltaY: icon ? Math.abs(icon.top + icon.height / 2 - (button.top + button.height / 2)) : 999,
        badgePosition: badgeStyle?.position,
        badgeBackground: badgeStyle?.backgroundColor
      };
    });

    expect(bellGeometry.buttonWidth).toBeGreaterThanOrEqual(44);
    expect(bellGeometry.buttonHeight).toBeGreaterThanOrEqual(44);
    expect(bellGeometry.iconWidth).toBeGreaterThanOrEqual(16);
    expect(bellGeometry.iconHeight).toBeGreaterThanOrEqual(16);
    expect(bellGeometry.iconCenterDeltaX).toBeLessThanOrEqual(1);
    expect(bellGeometry.iconCenterDeltaY).toBeLessThanOrEqual(1);
    expect(bellGeometry.badgePosition).toBe("absolute");
    expect(bellGeometry.badgeBackground).toBe("rgb(225, 29, 72)");
    if (viewport.width === 390 || viewport.width === 980) {
      await page.screenshot({
        path: testInfo.outputPath(`profile-unread-bell-${viewport.width}.png`),
        fullPage: viewport.width === 980,
        animations: "disabled",
        caret: "hide"
      });
    }

    for (const path of ["/profile", "/learning", "/community", "/payments", "/support", "/admin"]) {
      await page.goto(path);
      await expectResponsiveLayoutIntegrity(page, `${path} compact gutter audit`);
      const gutters = await page.locator(".app-shell").evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          left: Number.parseFloat(style.paddingLeft),
          right: Number.parseFloat(style.paddingRight)
        };
      });
      expect(gutters.left, path).toBeLessThanOrEqual(viewport.gutter + 0.5);
      expect(gutters.right, path).toBeLessThanOrEqual(viewport.gutter + 0.5);
      const contentBox = await page.locator(".section-host").boundingBox();
      expect(contentBox?.x ?? 999, `${path} content left edge`).toBeLessThanOrEqual(viewport.gutter + 0.5);
      expect(
        viewport.width - ((contentBox?.x ?? 0) + (contentBox?.width ?? 0)),
        `${path} content right edge`
      ).toBeLessThanOrEqual(viewport.gutter + 0.5);
      const navigationBox = await page.locator(".bottom-nav").boundingBox();
      expect(navigationBox?.x ?? 999, `${path} navigation left edge`).toBeLessThanOrEqual(viewport.gutter + 0.5);
      expect(
        viewport.width - ((navigationBox?.x ?? 0) + (navigationBox?.width ?? 0)),
        `${path} navigation right edge`
      ).toBeLessThanOrEqual(viewport.gutter + 0.5);
      if (path === "/profile") {
        const summaryBoxes = await page.locator(".profile-summary-card").evaluateAll((cards) =>
          cards.map((card) => {
            const rect = card.getBoundingClientRect();
            return { left: rect.left, right: rect.right, width: rect.width, height: rect.height };
          })
        );
        expect(summaryBoxes).toHaveLength(2);
        for (const box of summaryBoxes) {
          expect(box.left, "profile summary left edge").toBeGreaterThanOrEqual(-0.5);
          expect(box.right, "profile summary right edge").toBeLessThanOrEqual(viewport.width + 0.5);
          expect(box.width, "profile summary width").toBeGreaterThan(1);
          expect(box.height, "profile summary height").toBeGreaterThan(1);
        }
        expect(summaryBoxes[1]!.left, "profile summary cards must not overlap").toBeGreaterThanOrEqual(summaryBoxes[0]!.right - 1);
      }
      await expectNoHorizontalOverflow(page);
    }

    await page.goto("/support/new");
    const taskHeader = page.locator(".task-screen-route-layer .task-screen-header");
    await expect(taskHeader).toBeVisible();
    const headerBox = await taskHeader.boundingBox();
    expect(headerBox?.x ?? 999).toBeLessThanOrEqual(viewport.gutter + 0.5);
    expect(viewport.width - ((headerBox?.x ?? 0) + (headerBox?.width ?? 0))).toBeLessThanOrEqual(viewport.gutter + 0.5);
  }
});

test("opens the profile photo menu from both avatar controls", async ({ page }) => {
  const photoMenu = page.getByRole("dialog", { name: "Изменить фото профиля" });

  await page.getByRole("button", { name: "Изменить фото профиля" }).click();
  await expect(photoMenu).toBeVisible();
  await expect(photoMenu.getByText("Загрузить новое фото")).toBeVisible();
  await expect(photoMenu.getByText("Настроить кадр")).toBeVisible();
  await page.locator(".profile-modal-backdrop").click({ position: { x: 4, y: 4 } });

  await page.getByRole("button", { name: "Загрузить фото" }).click();
  await expect(photoMenu).toBeVisible();
});

test("keeps avatar changes as a draft until save", async ({ page }, testInfo) => {
  const updatedPhotoUrl = "https://cdn.example.com/avatar-saved.jpg";
  let uploadRequests = 0;
  await page.route("**/api/me/avatar/upload", async (route) => {
    uploadRequests += 1;
    await route.fulfill(json({
      user: {
        ...currentUser,
        photoUrl: updatedPhotoUrl,
        avatarPositionX: 50,
        avatarPositionY: 50,
        avatarScale: 1
      }
    }));
  });

  const openMenu = async () => {
    await page.getByRole("button", { name: "Изменить фото профиля" }).click();
    return page.getByRole("dialog", { name: "Изменить фото профиля" });
  };
  const chooseDraft = async () => {
    const menu = await openMenu();
    await expect(menu.locator(".profile-photo-menu-preview img")).toHaveAttribute("src", currentUser.photoUrl);
    const menuBox = await menu.boundingBox();
    const navBox = await page.locator(".mobile-bottom-nav").boundingBox();
    expect((menuBox?.y ?? 0) + (menuBox?.height ?? 0)).toBeLessThanOrEqual((navBox?.y ?? Number.POSITIVE_INFINITY) - 8);
    await page.screenshot({ path: testInfo.outputPath("avatar-photo-menu.png"), fullPage: false, animations: "disabled", caret: "hide" });
    await menu.locator('input[type="file"]').setInputFiles({
      name: "avatar-draft.png",
      mimeType: "image/png",
      buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64")
    });
    await expect(page).toHaveURL(/\/profile\/avatar$/);
    const preview = page.locator(".profile-avatar-crop-preview img");
    await expect(preview).toHaveAttribute("src", /^blob:/);
    await page.screenshot({ path: testInfo.outputPath("avatar-draft-editor.png"), fullPage: false, animations: "disabled", caret: "hide" });
  };

  await chooseDraft();
  expect(uploadRequests).toBe(0);
  await page.locator(".profile-avatar-editor-footer").getByRole("button", { name: "Отмена" }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.locator(".profile-avatar-trigger img")).toHaveAttribute("src", currentUser.photoUrl);
  expect(uploadRequests).toBe(0);

  await chooseDraft();
  await page.locator(".profile-avatar-editor-footer").getByRole("button", { name: "Сохранить" }).click();
  await expect(page).toHaveURL(/\/profile$/);
  expect(uploadRequests).toBe(1);
  await expect(page.locator(".profile-avatar-trigger img")).toHaveAttribute("src", updatedPhotoUrl);
});

test("keeps a permissionless administrator on safe member APIs while switching tabs", async ({ page }, testInfo) => {
  const permissionlessAdmin = {
    ...currentUser,
    id: "user-permissionless-admin",
    telegramId: "permissionless-admin",
    role: "admin" as const,
    realRole: "admin" as const,
    adminPermissions: []
  };
  const forbiddenRequests: string[] = [];

  page.on("request", (request) => {
    const requestPath = new URL(request.url()).pathname;
    if (!requestPath.startsWith("/api/")) return;
    const path = requestPath.replace(/^\/api/, "");
    if (
      path.startsWith("/admin/") ||
      path === "/payments/provider" ||
      path.startsWith("/support/admin/")
    ) {
      forbiddenRequests.push(path);
    }
  });

  await mockInstalledPwa(page, testInfo);
  await mockApi(page, permissionlessAdmin);
  await page.goto("/");

  await expect(page.getByRole("button", { name: "Админ" })).toHaveCount(0);
  for (const tab of ["Модули", "Общение", "Оплата", "Поддержка"]) {
    await page.getByRole("button", { name: tab }).last().click();
    await page.waitForTimeout(50);
  }

  for (const path of ["/payments/provider", "/payments/plans/new"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/payments$/);
  }
  for (const path of ["/admin/owner/transfer", "/admin/releases", "/admin/clients/user-1"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/profile$/);
  }

  expect(forbiddenRequests).toEqual([]);
  await expect(page.getByText(/Не удалось загрузить (?:админку|модули|общение|оплату|поддержку)/)).toHaveCount(0);
});

test("keeps system controls in English after changing the app language", async ({ page }) => {
  await page.evaluate(() => localStorage.setItem("club-locale", "en"));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Profile" }).first()).toBeVisible();

  const auditVisibleControls = async (context: string) => {
    const untranslated = await page.locator("button, label, summary, option, input, textarea, h1, h2, h3, h4, p, span, small, strong, em, [aria-label], [title]").evaluateAll((elements) =>
      elements.flatMap((element) => {
        const target = element as HTMLElement;
        const style = getComputedStyle(target);
        if (style.display === "none" || style.visibility === "hidden") return [];
        const hasUserContent = Boolean(target.closest(".module-card-toggle, .lesson-card-button, .continue-lesson-card, .admin-client-list-row, .chat-message-body, .support-ticket-card, .payment-product-title, .payment-product-badge")) || target.matches(".admin-mailing-card > header strong, .admin-mailing-card > p, .admin-payment-card .admin-payment-main strong");
        const values = [
          hasUserContent || target.children.length ? null : target.innerText,
          target.getAttribute("aria-label"),
          target.getAttribute("title"),
          target.getAttribute("placeholder")
        ].filter((value): value is string => Boolean(value));
        return values.filter((value) => /[А-Яа-яЁё]/.test(value) && !/Иван|Екатерина|Фиксики|Тест|Модуль|Владелец · @/.test(value) && !/^[А-ЯЁ]$/.test(value.trim()));
      })
    );
    expect(untranslated, `${context}: ${JSON.stringify(untranslated)}`).toEqual([]);
  };

  for (const tab of ["Modules", "Community", "Payment", "Support", "Admin"]) {
    await page.getByRole("button", { name: tab }).last().click();
    await page.waitForTimeout(80);
    await auditVisibleControls(tab);
  }

  for (const panel of ["Clients", "Mailings", "Payments", "Storage", "Project settings", "Administrators", "Server"]) {
    await page.getByRole("button", { name: panel, exact: true }).first().click();
    await page.waitForTimeout(80);
    await auditVisibleControls(`Admin / ${panel}`);
  }

  await page.goto("/learning");
  await page.getByRole("button", { name: "Add module" }).click();
  await auditVisibleControls("New module form");

  await page.goto("/payments");
  await page.getByRole("button", { name: "Edit plan" }).first().click();
  await auditVisibleControls("Edit payment plan form");

  await page.goto("/support/new");
  await auditVisibleControls("New support request form");

  await page.goto("/admin/mailings/new");
  await auditVisibleControls("New mailing form");

  await page.goto("/admin/releases");
  await auditVisibleControls("Release notes");
});

test("keeps mobile icon action controls consistently touch sized", async ({ page }, testInfo) => {
  test.skip(!["viewport-390-844", "galaxy-s24", "android-wide-layout-980"].includes(testInfo.project.name));

  await expectConsistentIconActionTargets(
    page,
    "profile header and avatar actions",
    iconActionControlSelector
  );

  await page.getByRole("button", { name: "Модули" }).click();
  await expect(page.getByRole("heading", { name: "Модули" }).first()).toBeVisible();
  await expectConsistentIconActionTargets(
    page,
    "learning module actions",
    iconActionControlSelector
  );

  await page.getByRole("button", { name: "Общение" }).click();
  await expect(page.getByRole("heading", { name: "Общение" }).first()).toBeVisible();
  await expectConsistentIconActionTargets(page, "community topic actions", iconActionControlSelector);
  await page.getByRole("button", { name: /Фиксики/ }).click();
  await expect(page.getByRole("heading", { name: "Фиксики" })).toBeVisible();
  await expectConsistentIconActionTargets(
    page,
    "community chat header and composer actions",
    iconActionControlSelector
  );
  await expectChatComposerCompactRow(page);

  await page.goto("/payments");
  await expect(page.getByRole("heading", { name: "Оплата" }).first()).toBeVisible();
  await expectConsistentIconActionTargets(
    page,
    "payments add and tariff admin actions",
    iconActionControlSelector
  );
});

test("separates profile header controls and module action levels", async ({ page }, testInfo) => {
  test.skip(!["viewport-390-844", "android-wide-layout-980"].includes(testInfo.project.name));
  if (testInfo.project.name === "viewport-390-844") {
    await page.setViewportSize({ width: 590, height: 1206 });
  }

  const profileControls = page.locator(".profile-page-header-controls");
  await expect(profileControls).toBeVisible();
  const profileFrame = await profileControls.evaluate((element) => {
    const style = getComputedStyle(element);
    return { borderWidth: style.borderTopWidth, background: style.backgroundColor, shadow: style.boxShadow };
  });
  expect(profileFrame).toEqual({ borderWidth: "0px", background: "rgba(0, 0, 0, 0)", shadow: "none" });
  await page.screenshot({ path: testInfo.outputPath("profile-unframed-controls.png"), fullPage: true });

  await page.getByRole("button", { name: "Модули" }).click();
  await page.getByRole("button", { name: "Редактировать модули" }).click();
  const moduleOne = page.locator(".admin-mockup-card").first();
  const moduleControls = moduleOne.locator(".module-level-sort-controls");
  await expect(moduleControls).toBeVisible();
  const moduleFrame = await moduleControls.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      borderWidth: style.borderTopWidth,
      background: style.backgroundColor,
      padding: style.padding,
      shadow: style.boxShadow
    };
  });
  expect(moduleFrame).toEqual({ borderWidth: "0px", background: "rgba(0, 0, 0, 0)", padding: "0px", shadow: "none" });
  await expect(moduleOne.getByRole("button", { name: "Редактировать Модуль 1" })).toBeVisible();
  await expect(moduleOne.getByRole("button", { name: "Добавить карточку в Модуль 1" })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("learning-collapsed-controls.png"), fullPage: true });
  await moduleOne.getByRole("button", { name: "Переключить Модуль 1" }).click();
  await expect(moduleOne.locator(".module-level-sort-controls")).toHaveCount(0);
  await expect(moduleOne.getByRole("button", { name: "Редактировать Модуль 1" })).toHaveCount(0);
  await expect(moduleOne.getByRole("button", { name: "Добавить карточку в Модуль 1" })).toBeVisible();
  const openCollapseControl = moduleOne.getByRole("button", { name: "Свернуть карточки Модуль 1" });
  await expect(openCollapseControl).toBeVisible();
  const [moduleBox, collapseBox] = await Promise.all([moduleOne.boundingBox(), openCollapseControl.boundingBox()]);
  expect(collapseBox?.x ?? 0).toBeGreaterThan((moduleBox?.x ?? 0) + (moduleBox?.width ?? 0) / 2);
  const singleLessonControls = moduleOne.locator(".lesson-level-sort-controls").first();
  const singleLessonControlMetrics = await singleLessonControls.evaluate((controls) => {
    const card = controls.closest(".module-lesson-sort-card");
    const cardBox = card?.getBoundingClientRect();
    const controlsBox = controls.getBoundingClientRect();
    const buttonWidth = Array.from(controls.querySelectorAll("button")).reduce(
      (total, button) => total + button.getBoundingClientRect().width,
      0
    );
    return {
      cardCenter: cardBox ? cardBox.left + cardBox.width / 2 : 0,
      controlsCenter: controlsBox.left + controlsBox.width / 2,
      controlsWidth: controlsBox.width,
      buttonWidth
    };
  });
  expect(singleLessonControlMetrics.controlsWidth).toBeLessThanOrEqual(singleLessonControlMetrics.buttonWidth + 1);
  expect(Math.abs(singleLessonControlMetrics.controlsCenter - singleLessonControlMetrics.cardCenter)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("learning-single-card-controls.png"), fullPage: true });
  await moduleOne.locator(".admin-mockup-grid").evaluate((grid) => {
    const lesson = grid.querySelector(".module-lesson-sort-card");
    if (!lesson) return;
    const clones = [lesson.cloneNode(true), lesson.cloneNode(true)] as HTMLElement[];
    [lesson, ...clones].forEach((card) => {
      card.classList.remove("module-lesson-sort-card-horizontal");
      card.classList.add("module-lesson-sort-card-vertical");
    });
    grid.append(...clones);
  });
  const lessonControls = moduleOne.locator(".lesson-level-sort-controls").first();
  await expect(lessonControls).toBeVisible();
  const lessonControlMetrics = await moduleOne.locator(".admin-mockup-grid").evaluate((grid) =>
    Array.from(grid.querySelectorAll(".module-lesson-sort-card"), (card) => {
      const controls = card.querySelector(".lesson-level-sort-controls");
      const cardBox = card.getBoundingClientRect();
      const controlsBox = controls?.getBoundingClientRect();
      const buttons = Array.from(controls?.querySelectorAll("button") ?? [], (button) => {
        const buttonBox = button.getBoundingClientRect();
        const buttonStyle = getComputedStyle(button);
        return {
          left: buttonBox.left,
          right: buttonBox.right,
          width: buttonStyle.width,
          minWidth: buttonStyle.minWidth,
          boxSizing: buttonStyle.boxSizing,
          padding: buttonStyle.padding
        };
      });
      const overflow = buttons.some((buttonBox) => buttonBox.left < cardBox.left - 1 || buttonBox.right > cardBox.right + 1)
        || Boolean(controlsBox && (controlsBox.left < cardBox.left - 1 || controlsBox.right > cardBox.right + 1));
      return {
        card: { left: cardBox.left, right: cardBox.right },
        controls: controlsBox ? { left: controlsBox.left, right: controlsBox.right } : null,
        buttons,
        overflow
      };
    })
  );
  expect(lessonControlMetrics.filter((item) => item.overflow), JSON.stringify(lessonControlMetrics)).toEqual([]);
  const lessonFrame = await lessonControls.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      borderWidth: style.borderTopWidth,
      background: style.backgroundColor,
      padding: style.padding,
      shadow: style.boxShadow
    };
  });
  expect(lessonFrame).toEqual({ borderWidth: "0px", background: "rgba(0, 0, 0, 0)", padding: "0px", shadow: "none" });
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("learning-separated-controls.png"), fullPage: true });

  const lessonGrid = moduleOne.locator(".admin-mockup-grid");
  const threeCardWidth = (await lessonGrid.locator(".module-lesson-sort-card").first().boundingBox())?.width ?? 0;
  await lessonGrid.locator(".module-lesson-sort-card").last().evaluate((card) => card.remove());
  const twoCardWidth = (await lessonGrid.locator(".module-lesson-sort-card").first().boundingBox())?.width ?? 0;
  await lessonGrid.locator(".module-lesson-sort-card").last().evaluate((card) => card.remove());
  const oneCardWidth = (await lessonGrid.locator(".module-lesson-sort-card").first().boundingBox())?.width ?? 0;
  expect(Math.abs(twoCardWidth - threeCardWidth)).toBeLessThanOrEqual(1);
  expect(Math.abs(oneCardWidth - threeCardWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("learning-stable-single-card-width.png"), fullPage: true });

  await page.evaluate(() => {
    localStorage.setItem("club-appearance-version", "7");
    localStorage.setItem("club-theme", "dark");
    localStorage.setItem("club-design-theme", "pine-teal");
  });
  await page.goto("/profile");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-design-theme", "pine-teal");
  await expect(page.locator(".profile-page-header-controls")).toHaveCSS("border-top-width", "0px");
  await page.getByRole("button", { name: "Модули" }).click();
  await page.getByRole("button", { name: "Редактировать модули" }).click();
  const darkModuleOne = page.locator(".admin-mockup-card").first();
  await expect(darkModuleOne.locator(".module-level-sort-controls")).toHaveCSS("border-top-width", "0px");
  await expect(darkModuleOne.locator(".module-level-sort-controls")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await darkModuleOne.getByRole("button", { name: "Переключить Модуль 1" }).click();
  await expect(darkModuleOne.locator(".module-level-sort-controls")).toHaveCount(0);
  await expect(darkModuleOne.getByRole("button", { name: "Свернуть карточки Модуль 1" })).toBeVisible();
  await expect(darkModuleOne.locator(".lesson-level-sort-controls").first()).toHaveCSS("border-top-width", "0px");
  await expect(darkModuleOne.locator(".lesson-level-sort-controls").first()).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await page.screenshot({ path: testInfo.outputPath("learning-separated-controls-dark.png"), fullPage: true });
});

test("keeps profile action buttons visually sized in Android PWA scaled shells", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "android-wide-layout-980");

  await expect(page.getByRole("heading", { name: "Профиль" }).first()).toBeVisible();
  await expectProfileActionButtonsUseScaledFoundation(page);
  await page.screenshot({ path: testInfo.outputPath("profile-scaled-actions.png"), fullPage: false, animations: "disabled", caret: "hide" });
});

test("keeps every routed PWA screen responsive on audited viewports", async ({ page }, testInfo) => {
  test.skip(!responsiveRouteAuditProjects.has(testInfo.project.name));
  test.setTimeout(120_000);

  for (const auditRoute of responsiveRouteAuditPaths) {
    await page.goto(auditRoute.path);
    await expect(page.locator(auditRoute.selector).first(), auditRoute.path).toBeVisible({ timeout: 12_000 });
    await expectResponsiveLayoutIntegrity(page, auditRoute.path);
    await expectKeyboardSafeIfFormRoute(page, auditRoute.path);
  }
});

test("opens admin task screens when their URLs are loaded directly", async ({ page }) => {
  await page.goto("/admin/mailings/new");
  await expect(page).toHaveURL(/\/admin\/mailings\/new$/);
  await expect(page.locator(".admin-mailing-task-screen .task-screen")).toBeVisible();

  await page.goto("/admin/mailings/history");
  await expect(page).toHaveURL(/\/admin\/mailings\/history$/);
  await expect(page.locator(".admin-mailing-history-task-screen .task-screen")).toBeVisible();
  await expect(page.getByText(adminMailing.title, { exact: true })).toBeVisible();

  await page.goto("/admin/mailings/mailing-demo");
  await expect(page).toHaveURL(/\/admin\/mailings\/mailing-demo$/);
  await expect(page.locator(".admin-task-screen .task-screen")).toBeVisible();

  await page.goto("/admin/server/logs");
  await expect(page).toHaveURL(/\/admin\/server\/logs$/);
  await expect(page.locator(".admin-task-screen .task-screen")).toBeVisible();
});

test("opens actionable admin attention items without double-counting", async ({ page }, testInfo) => {
  test.skip(!["release-desktop", "release-android"].includes(testInfo.project.name));
  const currentTimestamp = new Date().toISOString();
  const expiresSoon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
  const failedOrder = {
    ...adminPaymentOrder,
    id: "payment-failed-and-bad-webhook",
    status: "failed",
    webhook: { isValid: false, createdAt: currentTimestamp },
    paidAt: null,
    createdAt: currentTimestamp,
    updatedAt: currentTimestamp
  };
  const invalidWebhookOrder = {
    ...adminPaymentOrder,
    id: "payment-invalid-webhook",
    webhook: { isValid: false, createdAt: currentTimestamp },
    paidAt: currentTimestamp,
    createdAt: currentTimestamp,
    updatedAt: currentTimestamp
  };

  await page.route("**/api/admin/stats", async (route) => {
    await route.fulfill(
      json({
        totalUsers: 3,
        activeUsers: 1,
        completedItems: 4,
        totalItems: 18,
        users: [{ ...adminStatsUser, membershipExpiresAt: expiresSoon }, inactiveStatsUser, closedStatsUser],
        communityMessages: []
      })
    );
  });
  await page.route("**/api/payments/admin/orders", async (route) => {
    await route.fulfill(json({ orders: [failedOrder, invalidWebhookOrder] }));
  });

  const viewports = testInfo.project.name === "release-android"
    ? [
        { name: "320", width: 320, height: 720 },
        { name: "390", width: 390, height: 844 },
        { name: "768", width: 768, height: 1024 }
      ]
    : [
        { name: "1024", width: 1024, height: 768 },
        { name: "1440", width: 1440, height: 900 }
      ];

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/admin");
    const attention = page.locator(".admin-stat-attention");
    await expect(attention).toBeVisible();
    await expect(page.getByRole("button", { name: "Открыть клиентов с истекающим доступом" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Открыть проблемные платежи" })).toContainText("2");
    await expectResponsiveLayoutIntegrity(page, "/admin");
    await attention.screenshot({ path: testInfo.outputPath(`admin-attention-${viewport.name}.png`), animations: "disabled" });
  }

  await page.getByRole("button", { name: "Открыть клиентов с истекающим доступом" }).click();
  await expect(page).toHaveURL(/\/admin\/statistics\/users\/access-expiring_soon$/);
  await expect(page.getByRole("heading", { name: "Истекают скоро", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Назад" }).click();

  await page.getByRole("button", { name: "Открыть проблемные платежи" }).click();
  await expect(page).toHaveURL(/\/admin\/statistics\/payments\/attention$/);
  await expect(page.getByRole("heading", { name: "Проблемы с оплатой", exact: true })).toBeVisible();
  await expect(page.locator(".admin-payment-drilldown-card")).toHaveCount(2);
  await expect(page.getByText("Оплата + уведомление", { exact: true })).toBeVisible();
  await expect(page.getByText("Ошибка уведомления", { exact: true })).toBeVisible();
});

test("keeps error tracker notification controls compact", async ({ page }, testInfo) => {
  test.skip(!["android-compact-320", "viewport-390-844"].includes(testInfo.project.name));
  await page.goto("/admin");
  await page.getByRole("button", { name: "Сервер", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Сервер и интеграции" })).toBeVisible();
  const pushCheckbox = page.getByLabel("PWA push");
  const emailCheckbox = page.getByLabel("Email", { exact: true });
  await expect(pushCheckbox).toBeVisible();
  await expect(emailCheckbox).toBeVisible();
  await expect(pushCheckbox).toHaveCSS("width", "20px");
  await expect(pushCheckbox).toHaveCSS("height", "20px");
  await expect(emailCheckbox).toHaveCSS("width", "20px");
  await expect(emailCheckbox).toHaveCSS("height", "20px");
  await expect(page.getByRole("button", { name: "Создать тестовую ошибку" })).toBeVisible();
  await expectResponsiveLayoutIntegrity(page, "/admin/server/logs");
  await page.screenshot({ path: testInfo.outputPath("error-tracker-compact-controls.png"), fullPage: true, animations: "disabled" });
});

test("keeps the copyable error detail usable at all target widths", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chrome");
  test.setTimeout(120_000);
  const viewports = [
    { name: "320", width: 320, height: 720 },
    { name: "390", width: 390, height: 844 },
    { name: "768", width: 768, height: 1024 },
    { name: "1024", width: 1024, height: 768 },
    { name: "1440", width: 1440, height: 900 }
  ];
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/admin");
    await page.getByRole("button", { name: "Сервер", exact: true }).click();
    await page.getByRole("button", { name: /Не удалось открыть оплату/ }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/server/errors/${errorTrackerGroup.id}$`));
    await expect(page.getByRole("heading", { name: "Ошибка", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Скопировать отчёт" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Скопировать технический тип" })).toBeVisible();
    await expectResponsiveLayoutIntegrity(page, `/admin/server/errors/${errorTrackerGroup.id}`);
    await page.screenshot({ path: testInfo.outputPath(`error-copy-${viewport.name}.png`), animations: "disabled" });
    await page.getByRole("button", { name: "Назад" }).click();
    await expect(page).toHaveURL(/\/admin\/server\/logs$/);
  }

  await page.goto(`/admin/server/logs?error=${errorTrackerGroup.id}`);
  await expect(page.getByRole("heading", { name: "Ошибка", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Скопировать отчёт" })).toBeVisible();
});

test("opens payment admin task screens when their URLs are loaded directly", async ({ page }) => {
  await page.goto("/payments/provider");
  await expect(page).toHaveURL(/\/payments\/provider$/);
  await expect(page.locator(".payment-task-screen .task-screen")).toBeVisible();

  await page.goto("/payments/plans/new");
  await expect(page).toHaveURL(/\/payments\/plans\/new$/);
  await expect(page.locator(".payment-task-screen .task-screen")).toBeVisible();
});

test("opens a personal payment offer without viewport overflow", async ({ page }, testInfo) => {
  await page.goto(`/payments/offers/${individualOfferToken}`);
  await expect(page.locator(".offer-card")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Персональный доступ к клубу" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Оплатить/ })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  if (testInfo.project.name === "release-android") {
    await page.screenshot({ path: testInfo.outputPath("individual-payment-offer.png"), fullPage: false, animations: "disabled" });
  }
});

test("keeps routed task screens full width in wide mobile PWA viewports", async ({ page }, testInfo) => {
  test.skip(!wideMobilePwaRouteAuditProjects.has(testInfo.project.name));
  test.setTimeout(120_000);

  for (const auditRoute of responsiveRouteAuditPaths.filter((route) => route.selector.includes("task-screen") || route.selector.includes("release-notes-modal"))) {
    await page.goto(auditRoute.path);
    await expect(page.locator(auditRoute.selector).first(), auditRoute.path).toBeVisible({ timeout: 12_000 });
    await expectResponsiveLayoutIntegrity(page, auditRoute.path);
    await expectRoutedTaskScreenFillsMobilePwaViewport(page, auditRoute.path);
  }
});

test("keeps routed task screens full width for plain Samsung mobile shells", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "android-wide-layout-980");
  test.setTimeout(120_000);

  for (const auditRoute of responsiveRouteAuditPaths.filter((route) => route.selector.includes("task-screen") || route.selector.includes("release-notes-modal"))) {
    await page.goto(auditRoute.path);
    await expect(page.locator(auditRoute.selector).first(), auditRoute.path).toBeVisible({ timeout: 12_000 });
    await forcePlainMobileDeviceShell(page);
    await expectResponsiveLayoutIntegrity(page, auditRoute.path);
    await expectRoutedTaskScreenFillsMobilePwaViewport(page, auditRoute.path);
  }
});

test("keeps routed task screens full width even when a 980px mobile shell misses mobile classes", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "android-wide-layout-980");

  const unclassifiedRoutes = [
    { path: "/notifications", selector: ".notification-task-screen .task-screen" },
    { path: "/support/tickets/ticket-payment", selector: ".support-ticket-task-screen .task-screen" },
    { path: "/admin/releases", selector: ".admin-task-screen .task-screen" }
  ];

  for (const auditRoute of unclassifiedRoutes) {
    await page.goto(auditRoute.path);
    await expect(page.locator(auditRoute.selector).first(), auditRoute.path).toBeVisible({ timeout: 12_000 });
    await stripMobileDeviceShell(page);

    const metrics = await page.evaluate((selector) => {
      const task = document.querySelector<HTMLElement>(selector);
      const layer = task?.closest<HTMLElement>(".task-screen-route-layer") ?? null;
      const taskBox = task?.getBoundingClientRect();
      const layerBox = layer?.getBoundingClientRect();
      const describe = (box: DOMRect | undefined) =>
        box
          ? {
              x: Math.round(box.x),
              width: Math.round(box.width),
              right: Math.round(box.right)
            }
          : null;
      return {
        viewportWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        hasRouteLayer: Boolean(layer),
        task: describe(taskBox),
        layer: describe(layerBox)
      };
    }, auditRoute.selector);

    expect(metrics.hasRouteLayer, `${auditRoute.path}: ${JSON.stringify(metrics, null, 2)}`).toBe(true);
    expect(metrics.scrollWidth, `${auditRoute.path}: ${JSON.stringify(metrics, null, 2)}`).toBeLessThanOrEqual(metrics.viewportWidth + 2);
    expect(metrics.layer?.x, `${auditRoute.path}: ${JSON.stringify(metrics, null, 2)}`).toBe(0);
    expect(metrics.layer?.width, `${auditRoute.path}: ${JSON.stringify(metrics, null, 2)}`).toBeGreaterThanOrEqual(metrics.viewportWidth - 2);
    expect(metrics.task?.x, `${auditRoute.path}: ${JSON.stringify(metrics, null, 2)}`).toBe(0);
    expect(metrics.task?.width, `${auditRoute.path}: ${JSON.stringify(metrics, null, 2)}`).toBeGreaterThanOrEqual(metrics.viewportWidth - 2);
  }
});

test("keeps routed PWA screens responsive across exact mobile audit sizes", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "viewport-412-915");
  test.setTimeout(420_000);

  for (const viewport of exactMobileAuditViewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.reload();
    await expect(page.locator(".app-root")).toBeVisible();

    for (const auditRoute of responsiveRouteAuditPaths) {
      await page.goto(auditRoute.path);
      await expect(page.locator(auditRoute.selector).first(), `${viewport.name} ${auditRoute.path}`).toBeVisible({ timeout: 12_000 });
      await expectResponsiveLayoutIntegrity(page, `${viewport.name} ${auditRoute.path}`);
      await expectKeyboardSafeIfFormRoute(page, `${viewport.name} ${auditRoute.path}`);
    }
  }
});

test("reflows the installed mobile shell after orientation changes", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "viewport-390-844");

  await page.goto("/community");
  await page.getByRole("button", { name: /Фиксики/ }).click();
  await expect(page.getByRole("heading", { name: "Фиксики" })).toBeVisible();

  for (const viewport of [
    { width: 844, height: 390 },
    { width: 390, height: 844 }
  ]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => window.dispatchEvent(new Event("orientationchange")));
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--club-viewport-height").trim())).toBe(`${viewport.height}px`);
    await expectChatComposerCompactRow(page);
    await expectNoHorizontalOverflow(page);
  }
});

test("keeps routed PWA screens responsive across exact desktop audit sizes", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chrome");
  test.setTimeout(240_000);
  await continuePastDeviceNotice(page);

  for (const viewport of exactDesktopAuditViewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.reload();
    await expect(page.locator(".app-root")).toBeVisible();

    for (const auditRoute of responsiveRouteAuditPaths) {
      await page.goto(auditRoute.path);
      await expect(page.locator(auditRoute.selector).first(), `${viewport.name} ${auditRoute.path}`).toBeVisible({ timeout: 12_000 });
      await expectResponsiveLayoutIntegrity(page, `${viewport.name} ${auditRoute.path}`);
    }
  }
});

test("keeps the desktop fallback aligned with the mobile-only product mode", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chrome");

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/profile");
  await expect(page.getByRole("dialog", { name: "Приложение оптимизировано для телефона" })).toHaveCount(0);

  const sidebar = page.locator(".desktop-sidebar");
  await expect(sidebar).toHaveCount(0);
  await expect(page.locator(".mobile-bottom-nav")).toBeVisible();
  await expect(page.locator(".app-root")).toHaveClass(/desktop-mobile-preview/);
  await expect(page.locator(".profile-identity-head h3")).toHaveText(currentUser.displayName);
  const layout = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth
  }));
  expect(layout.documentWidth).toBe(layout.viewportWidth);

  await page.screenshot({
    path: testInfo.outputPath("desktop-mobile-preview-profile.png"),
    fullPage: true
  });
});

test("captures PWA UI foundation screenshots for audited routes", async ({ page }, testInfo) => {
  const isDesktopProject = testInfo.project.name === "desktop-chrome";
  const isMobileProject = testInfo.project.name === "viewport-412-915";
  test.skip(!isDesktopProject && !isMobileProject);
  test.setTimeout(420_000);

  const auditedViewports = pwaUiScreenshotViewports.filter((viewport) =>
    isDesktopProject ? viewport.width >= 1024 : viewport.width < 1024
  );

  for (const viewport of auditedViewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.reload();
    await expect(page.locator(".app-root")).toBeVisible();

    for (const auditRoute of responsiveRouteAuditPaths) {
      await page.goto(auditRoute.path);
      await expect(page.locator(auditRoute.selector).first(), `${viewport.name} ${auditRoute.path}`).toBeVisible({ timeout: 12_000 });
      await expectResponsiveLayoutIntegrity(page, `${viewport.name} ${auditRoute.path}`);
      const routeName = auditRoute.path.replace(/^\/$/, "root").replace(/[^\w-]+/g, "_").replace(/^_+|_+$/g, "") || "root";
      const screenshotPath = testInfo.outputPath("pwa-ui-screenshots", `${viewport.name}-${routeName}.png`);
      mkdirSync(dirname(screenshotPath), { recursive: true });
      await page.screenshot({
        path: screenshotPath,
        fullPage: true,
        animations: "disabled",
        caret: "hide"
      });
    }
  }
});

test("keeps design theme independent from day and night mode", async ({ page }) => {
  test.setTimeout(120_000);
  const root = page.locator("html");
  const designThemes = [
    { name: /Dark Soft Touch Premium/, value: "dark-soft-touch", lightBg: "#eef4fb", darkBg: "#080d16" },
    { name: /Graphite \+ Electric Blue/, value: "graphite-electric-blue", lightBg: "#eef3f9", darkBg: "#070b12" },
    { name: /Pine Teal/, value: "pine-teal", lightBg: "#edf5f0", darkBg: "#06110d" },
    { name: /Warm Clay/, value: "warm-clay", lightBg: "#f2ece4", darkBg: "#120d09" },
    { name: /Plum Rose/, value: "plum-rose", lightBg: "#f4edf5", darkBg: "#100812" }
  ] as const;

  for (const designTheme of designThemes) {
    for (const mode of [
      { value: "light", buttonName: "День", expectedBg: designTheme.lightBg },
      { value: "dark", buttonName: "Ночь", expectedBg: designTheme.darkBg }
    ] as const) {
      await page.goto("/profile");
      await page.getByRole("button", { name: /Оформление/ }).click();
      await expect(page.locator(".profile-detail-task-screen .task-screen")).toBeVisible();
      const designThemeButton = page.getByRole("button", { name: designTheme.name });
      await expect(designThemeButton).toHaveCount(1);
      await designThemeButton.scrollIntoViewIfNeeded();
      await designThemeButton.click();
      await expect(root).toHaveAttribute("data-design-theme", designTheme.value);
      await page.getByRole("button", { name: mode.buttonName, exact: true }).click();
      await expect(root).toHaveAttribute("data-theme", mode.value);
      await expect(root).toHaveAttribute("data-design-theme", designTheme.value);
      const tokens = await page.evaluate(() => {
        const styles = getComputedStyle(document.documentElement);
        return {
          bg: styles.getPropertyValue("--bg").trim(),
          surfaceMatches:
            styles.getPropertyValue("--surface").trim() === styles.getPropertyValue("--color-surface").trim(),
          primaryRgbMatches:
            styles.getPropertyValue("--ds-primary-rgb").trim() ===
            styles.getPropertyValue("--color-primary-rgb").trim()
        };
      });
      expect(tokens).toEqual({ bg: mode.expectedBg, surfaceMatches: true, primaryRgbMatches: true });

      if (["pine-teal", "warm-clay", "plum-rose"].includes(designTheme.value)) {
        for (const route of [
          { path: "/profile", selector: ".soft-home" },
          { path: "/learning", selector: ".modules-section" },
          { path: "/community", selector: ".community-chat-shell" }
        ]) {
          await page.goto(route.path);
          await expect(page.locator(route.selector).first()).toBeVisible();
          await expect(root).toHaveAttribute("data-theme", mode.value);
          await expect(root).toHaveAttribute("data-design-theme", designTheme.value);
          await expect
            .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bg").trim()))
            .toBe(mode.expectedBg);
        }
        await page.goto("/profile");
        await expect(page.getByRole("heading", { name: "Профиль" }).first()).toBeVisible();
      }
    }

    await page.reload();
    await expect(page.getByRole("heading", { name: "Профиль" }).first()).toBeVisible();
    await expect(root).toHaveAttribute("data-design-theme", designTheme.value);
    await expect(root).toHaveAttribute("data-theme", "dark");
  }

  await expectNoHorizontalOverflow(page);
});

test("audits activity-first client cards across every theme and target viewport", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chrome");
  test.setTimeout(420_000);

  const viewports = [
    { name: "320", width: 320, height: 720 },
    { name: "390", width: 390, height: 844 },
    { name: "768", width: 768, height: 1024 },
    { name: "1024", width: 1024, height: 768 }
  ] as const;
  const themes = ["dark-soft-touch", "graphite-electric-blue", "pine-teal", "warm-clay", "plum-rose"] as const;
  const modes = ["light", "dark"] as const;
  const artifactDir = process.env.CLIENT_ACTIVITY_ARTIFACT_DIR;
  const auditResults: Array<Record<string, unknown>> = [];
  if (artifactDir) mkdirSync(artifactDir, { recursive: true });

  await page.goto("/admin");
  await page.getByRole("button", { name: "Клиенты", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Клиенты и доступ" })).toBeVisible();

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    for (const theme of themes) {
      for (const mode of modes) {
        const context = `${theme}/${mode}/${viewport.name}`;
        await page.evaluate(
          ({ designTheme, colorMode }) => {
            document.documentElement.dataset.designTheme = designTheme;
            document.documentElement.dataset.theme = colorMode;
          },
          { designTheme: theme, colorMode: mode }
        );
        await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

        const cards = page.locator(".admin-client-list-row");
        await expect(cards, context).toHaveCount(3);
        const firstCard = cards.first();
        await page.locator(".admin-client-searchbar input").focus();
        for (let step = 0; step < 12 && !(await firstCard.evaluate((card) => document.activeElement === card)); step += 1) {
          await page.keyboard.press("Tab");
        }
        await expect(firstCard, context).toBeFocused();

        const visualMetrics = await firstCard.evaluate((card) => {
          type Color = [number, number, number, number];
          const canvas = document.createElement("canvas");
          canvas.width = 1;
          canvas.height = 1;
          const canvasContext = canvas.getContext("2d", { willReadFrequently: true })!;
          const parseColor = (value: string): Color => {
            canvasContext.clearRect(0, 0, 1, 1);
            canvasContext.fillStyle = value;
            canvasContext.fillRect(0, 0, 1, 1);
            const [red, green, blue, alpha] = canvasContext.getImageData(0, 0, 1, 1).data;
            return [red!, green!, blue!, alpha! / 255];
          };
          const over = (foreground: Color, background: Color): Color => {
            const alpha = foreground[3] + background[3] * (1 - foreground[3]);
            if (alpha === 0) return [0, 0, 0, 0];
            return [
              (foreground[0] * foreground[3] + background[0] * background[3] * (1 - foreground[3])) / alpha,
              (foreground[1] * foreground[3] + background[1] * background[3] * (1 - foreground[3])) / alpha,
              (foreground[2] * foreground[3] + background[2] * background[3] * (1 - foreground[3])) / alpha,
              alpha
            ];
          };
          const effectiveBackground = (start: Element | null): Color => {
            let result: Color = [0, 0, 0, 0];
            for (let current = start; current && result[3] < 0.999; current = current.parentElement) {
              result = over(result, parseColor(getComputedStyle(current).backgroundColor));
            }
            const canvas: Color = getComputedStyle(document.documentElement).colorScheme === "dark" ? [0, 0, 0, 1] : [255, 255, 255, 1];
            return over(result, canvas);
          };
          const luminance = (color: Color) => {
            const channels = color.slice(0, 3).map((channel) => {
              const value = channel / 255;
              return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
            });
            return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
          };
          const contrast = (first: Color, second: Color) => {
            const lighter = Math.max(luminance(first), luminance(second));
            const darker = Math.min(luminance(first), luminance(second));
            return (lighter + 0.05) / (darker + 0.05);
          };
          const cardStyle = getComputedStyle(card);
          const outsideBackground = effectiveBackground(card.parentElement);
          const outline = over(parseColor(cardStyle.outlineColor), outsideBackground);
          const insideBackground = effectiveBackground(card);
          const name = card.querySelector<HTMLElement>(".admin-client-list-name-line strong")!;
          const lastLogin = card.querySelector<HTMLElement>(".admin-client-last-visit > strong")!;
          const metrics = Array.from(card.querySelectorAll<HTMLElement>(".admin-client-list-metrics > span"));
          const nameStyle = getComputedStyle(name);
          const lastLoginStyle = getComputedStyle(lastLogin);
          const metricStyles = metrics.map((metric) => getComputedStyle(metric));
          const metricContrasts = metricStyles.map((style) => contrast(over(parseColor(style.color), insideBackground), insideBackground));

          return {
            outlineContrast: contrast(outline, outsideBackground),
            outlineStyle: cardStyle.outlineStyle,
            nameSize: Number.parseFloat(nameStyle.fontSize),
            lastLoginSize: Number.parseFloat(lastLoginStyle.fontSize),
            lastLoginWeight: Number.parseInt(lastLoginStyle.fontWeight, 10),
            metricSize: Math.max(...metricStyles.map((style) => Number.parseFloat(style.fontSize))),
            metricWeight: Math.max(...metricStyles.map((style) => Number.parseInt(style.fontWeight, 10))),
            lastLoginContrast: contrast(over(parseColor(lastLoginStyle.color), insideBackground), insideBackground),
            metricContrast: Math.max(...metricContrasts)
          };
        });

        expect.soft(visualMetrics.outlineStyle, context).not.toBe("none");
        expect.soft(visualMetrics.outlineContrast, context).toBeGreaterThanOrEqual(3);
        expect.soft(visualMetrics.nameSize, context).toBeGreaterThan(visualMetrics.lastLoginSize);
        expect.soft(visualMetrics.lastLoginSize, context).toBeGreaterThan(visualMetrics.metricSize);
        expect.soft(visualMetrics.lastLoginWeight, context).toBeGreaterThan(visualMetrics.metricWeight);
        expect.soft(visualMetrics.lastLoginContrast, context).toBeGreaterThan(visualMetrics.metricContrast);

        const longContact = firstCard.locator(".admin-client-list-contact");
        let contactLayout: {
          clientWidth: number;
          scrollWidth: number;
          overflow: string;
          textOverflow: string;
          whiteSpace: string;
        } | null = null;
        if (viewport.width <= 390) {
          contactLayout = await longContact.evaluate((contact) => {
            const style = getComputedStyle(contact);
            return {
              clientWidth: contact.clientWidth,
              scrollWidth: contact.scrollWidth,
              overflow: style.overflow,
              textOverflow: style.textOverflow,
              whiteSpace: style.whiteSpace
            };
          });
          expect.soft(contactLayout.whiteSpace, context).toBe("nowrap");
          expect.soft(contactLayout.overflow, context).toBe("hidden");
          expect.soft(contactLayout.textOverflow, context).toBe("ellipsis");
          expect.soft(contactLayout.scrollWidth, context).toBeGreaterThan(contactLayout.clientWidth);
        }

        const neverLoginCard = cards.filter({ hasText: "Клиент Без Доступа" });
        expect.soft((await neverLoginCard.locator(".admin-client-last-visit > strong").textContent())?.trim(), context).toBe("Не входил");
        expect.soft(await neverLoginCard.locator(".admin-client-list-contact").count(), context).toBe(0);
        expect.soft(await cards.locator(".admin-access-badge").allTextContents(), context).toEqual(
          expect.arrayContaining(["Доступ открыт", "Доступ ограничен", "Доступ закрыт"])
        );

        const cardBounds = await cards.evaluateAll((elements) => elements.map((element) => {
          const cardRect = element.getBoundingClientRect();
          const chevron = element.querySelector<HTMLElement>(".admin-client-list-chevron");
          const chevronRect = chevron?.getBoundingClientRect();
          return {
            cardClientWidth: element.clientWidth,
            cardScrollWidth: element.scrollWidth,
            cardLeft: cardRect.left,
            cardRight: cardRect.right,
            chevronDisplay: chevron ? getComputedStyle(chevron).display : "missing",
            chevronWidth: chevronRect?.width ?? 0,
            chevronLeft: chevronRect?.left ?? -1,
            chevronRight: chevronRect?.right ?? -1
          };
        }));
        for (const bounds of cardBounds) {
          expect.soft(bounds.cardScrollWidth, context).toBeLessThanOrEqual(bounds.cardClientWidth);
          expect.soft(bounds.cardLeft, context).toBeGreaterThanOrEqual(-1);
          expect.soft(bounds.cardRight, context).toBeLessThanOrEqual(viewport.width + 1);
          expect.soft(bounds.chevronDisplay, context).not.toBe("none");
          expect.soft(bounds.chevronWidth, context).toBeGreaterThan(0);
          expect.soft(bounds.chevronLeft, context).toBeGreaterThanOrEqual(bounds.cardLeft);
          expect.soft(bounds.chevronRight, context).toBeLessThanOrEqual(bounds.cardRight + 1);
        }
        await expectNoHorizontalOverflow(page, ".admin-panel");
        auditResults.push({ theme, mode, viewport: viewport.name, ...visualMetrics, contactLayout, cardBounds });

        if (artifactDir) {
          await page.screenshot({
            path: `${artifactDir}/clients-${theme}-${mode}-${viewport.name}.png`,
            fullPage: true,
            animations: "disabled",
            caret: "hide"
          });
        }
      }
    }
  }

  if (artifactDir) writeFileSync(`${artifactDir}/audit-results.json`, `${JSON.stringify(auditResults, null, 2)}\n`);
});

test("uses Warm Clay day and protects mobile scale from accidental swipes", async ({ page }) => {
  const root = page.locator("html");
  await expect(root).toHaveAttribute("data-theme", "light");
  await expect(root).toHaveAttribute("data-design-theme", "warm-clay");
  await page.getByRole("button", { name: /Оформление/ }).click();
  await expect(page.locator(".visual-scale-range")).toBeVisible();

  const themeColumns = await page.locator(".design-theme-choice").evaluateAll((rows) =>
    rows.map((row) => {
      const rowBox = row.getBoundingClientRect();
      const preview = row.querySelector<HTMLElement>(".design-theme-preview")?.getBoundingClientRect();
      const copy = row.querySelector<HTMLElement>(".design-theme-copy")?.getBoundingClientRect();
      const check = row.querySelector<HTMLElement>(".design-theme-check")?.getBoundingClientRect();
      return {
        previewX: (preview?.x ?? 0) - rowBox.x,
        copyX: (copy?.x ?? 0) - rowBox.x,
        checkX: (check?.x ?? 0) - rowBox.x
      };
    })
  );
  for (const key of ["previewX", "copyX", "checkX"] as const) {
    const positions = themeColumns.map((column) => column[key]);
    expect(Math.max(...positions) - Math.min(...positions)).toBeLessThanOrEqual(1);
  }

  const range = page.locator(".visual-scale-range");
  const coarsePointer = await page.evaluate(() => matchMedia("(hover: none) and (pointer: coarse)").matches);
  const pointerEvents = await range.evaluate((element) => getComputedStyle(element).pointerEvents);
  if (coarsePointer) {
    expect(pointerEvents).toBe("none");
    const rangeBox = await range.boundingBox();
    expect(rangeBox).not.toBeNull();
    await page.touchscreen.tap(
      (rangeBox?.x ?? 0) + (rangeBox?.width ?? 0) * 0.8,
      (rangeBox?.y ?? 0) + (rangeBox?.height ?? 0) / 2
    );
    await expect(root).toHaveAttribute("data-visual-scale", "0.9");
    await page.getByRole("button", { name: "Увеличить масштаб", exact: true }).click();
    await expect(root).toHaveAttribute("data-visual-scale", "1.0");
  } else {
    expect(pointerEvents).toBe("auto");
  }

  const bottomNavigation = page.locator(".mobile-bottom-nav");
  const profileNavigationItem = bottomNavigation.locator(".bottom-nav-item").first();
  const flushNavigationSwitch = page.getByRole("switch", { name: "Прижать нижнее меню" });
  await expect(flushNavigationSwitch).toHaveAttribute("aria-checked", "false");
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--club-calibrated-bottom-offset", "34px");
    document.body.style.setProperty("--club-calibrated-bottom-offset", "34px");
  });
  const floatingNavigationBox = await bottomNavigation.boundingBox();
  expect(floatingNavigationBox).not.toBeNull();
  const floatingNavigationShape = await bottomNavigation.evaluate((navigation) => {
    const styles = getComputedStyle(navigation);
    return {
      bottomLeftRadius: styles.borderBottomLeftRadius,
      bottomRightRadius: styles.borderBottomRightRadius
    };
  });
  const floatingItemBox = await profileNavigationItem.boundingBox();
  expect(floatingItemBox).not.toBeNull();
  const switchBox = await flushNavigationSwitch.boundingBox();
  expect(switchBox).not.toBeNull();
  if ((page.viewportSize()?.width ?? 0) <= 480) {
    expect(Math.round(switchBox?.width ?? 0)).toBe(52);
    expect(Math.round(switchBox?.height ?? 0)).toBe(44);
  }
  await flushNavigationSwitch.click();
  await expect(root).toHaveClass(/club-bottom-nav-flush/);
  await expect(bottomNavigation).toHaveClass(/mobile-bottom-nav-flush/);
  await expect(bottomNavigation).toHaveCSS("bottom", "12px");
  await expect(bottomNavigation).toHaveCSS("border-bottom-left-radius", floatingNavigationShape.bottomLeftRadius);
  await expect(bottomNavigation).toHaveCSS("border-bottom-right-radius", floatingNavigationShape.bottomRightRadius);
  await expect
    .poll(async () => {
      const pinnedNavigationBox = await bottomNavigation.boundingBox();
      return Math.round((pinnedNavigationBox?.height ?? 0) - (floatingNavigationBox?.height ?? 0));
    })
    .toBe(0);
  await expect
    .poll(async () => {
      const pinnedItemBox = await profileNavigationItem.boundingBox();
      return Math.round((pinnedItemBox?.y ?? 0) - (floatingItemBox?.y ?? 0));
    })
    .toBeGreaterThan(0);
  await expect
    .poll(async () =>
      bottomNavigation.evaluate((navigation) =>
        Math.round(window.innerHeight - navigation.getBoundingClientRect().bottom)
      )
    )
    .toBe(12);
  await expect
    .poll(async () =>
      bottomNavigation.evaluate((navigation) => {
        const navigationStyle = getComputedStyle(navigation);
        const pagePadding = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--page-padding"));
        return Math.round(
          Math.max(
            Math.abs(Number.parseFloat(navigationStyle.left) - pagePadding),
            Math.abs(Number.parseFloat(navigationStyle.right) - pagePadding)
          )
        );
      })
    )
    .toBeLessThanOrEqual(1);
  await expect
    .poll(async () =>
      bottomNavigation.evaluate((navigation) => {
        const rect = navigation.getBoundingClientRect();
        const pagePadding = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--page-padding"));
        const viewportWidth = document.documentElement.clientWidth;
        return Math.round(
          Math.max(
            Math.abs(rect.left - pagePadding),
            Math.abs(viewportWidth - rect.right - pagePadding)
          )
        );
      })
    )
    .toBeLessThanOrEqual(1);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("club-bottom-navigation-flush")))
    .toBe("1");
  await page.reload();
  await expect(page.locator(".mobile-bottom-nav")).toHaveClass(/mobile-bottom-nav-flush/);
  await expect
    .poll(() =>
      page.locator(".mobile-bottom-nav").evaluate((navigation) =>
        Math.round(window.innerHeight - navigation.getBoundingClientRect().bottom)
      )
    )
    .toBe(12);
  for (const route of ["/profile", "/learning", "/community", "/support"]) {
    await page.goto(route);
    await page.locator(".mobile-bottom-nav").waitFor({ state: "attached" });
    const flushSurface = await page.evaluate(() => {
      const rootStyle = getComputedStyle(document.documentElement);
      const bodyStyle = getComputedStyle(document.body);
      const appStyle = getComputedStyle(document.querySelector<HTMLElement>("#app")!);
      const navigationStyle = getComputedStyle(document.querySelector<HTMLElement>(".mobile-bottom-nav")!);
      return {
        rootBackground: rootStyle.backgroundColor,
        bodyBackground: bodyStyle.backgroundColor,
        appBackground: appStyle.backgroundColor,
        navigationShadow: navigationStyle.boxShadow,
        navigationBottom: Math.round(
          window.innerHeight - document.querySelector<HTMLElement>(".mobile-bottom-nav")!.getBoundingClientRect().bottom
        )
      };
    });
    expect(flushSurface.bodyBackground).toBe(flushSurface.rootBackground);
    expect(flushSurface.appBackground).toBe(flushSurface.rootBackground);
    expect(flushSurface.navigationShadow).not.toContain("20px 46px");
    expect(flushSurface.navigationBottom).toBe(12);
  }
  await expectNoHorizontalOverflow(page);
});

test("stacks payment tariff cards into readable mobile rows", async ({ page }, testInfo) => {
  const paymentNavigation = page.locator('.bottom-nav-item[aria-label="Оплата"], .desktop-sidebar-item[aria-label="Оплата"]');
  await expect(paymentNavigation).toHaveCount(1);
  await paymentNavigation.click();
  await expect(page.getByRole("heading", { name: "Оплата" }).first()).toBeVisible();

  const cards = page.locator(".payment-product-list .soft-payment-card");
  await expect(cards).toHaveCount(2);
  const boxes = await cards.evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }));
  const viewport = page.viewportSize();

  if ((viewport?.width ?? 0) < 1024) {
    expect(boxes[0]?.width).toBeGreaterThan((viewport?.width ?? 0) * 0.82);
    expect(boxes[1]?.y).toBeGreaterThan((boxes[0]?.y ?? 0) + (boxes[0]?.height ?? 0));
  }
  if (testInfo.project.name === "pixel-7") {
    await page.screenshot({ path: testInfo.outputPath("payment-layout.png"), fullPage: false });
    await page.evaluate(() => {
      document.documentElement.dataset.theme = "light";
    });
    await page.screenshot({ path: testInfo.outputPath("payment-layout-light.png"), fullPage: false });
  }
  await expectNoHorizontalOverflow(page);
});

test("keeps shared mobile modal surfaces sized across device shells", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "desktop-chrome");

  for (const fixture of mobileModalFixtures) {
    await renderMobileModalFixture(page, fixture);
    await expectMobileModalFitsViewport(page, testInfo, fixture);
  }
});

test("keeps support and mailing forms usable when the Android keyboard opens", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "desktop-chrome");

  const keyboardFixtures = [mobileModalFixtures[2], mobileModalFixtures[9]];
  for (const fixture of keyboardFixtures) {
    await renderMobileModalFixture(page, fixture);
    const shellScale = await page.evaluate(() => {
      const isScaledShell = document.documentElement.classList.contains("club-mobile-app-scaled");
      return isScaledShell
        ? Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--club-app-wide-viewport-scale")) || 1
        : 1;
    });
    await page.evaluate((scale) => {
      document.documentElement.classList.add("club-keyboard-open");
      document.body.classList.add("club-keyboard-open");
      document.documentElement.style.setProperty("--club-visible-viewport-height", `${420 * scale}px`);
      document.documentElement.style.setProperty("--club-system-bottom", `${360 * scale}px`);
      document.documentElement.style.setProperty("--club-calibrated-bottom-offset", `${360 * scale}px`);
    }, shellScale);

    const box = await page.locator("[data-modal-fixture-panel]").boundingBox();
    expect(box, fixture.modalClass).not.toBeNull();
    const effectiveHeight = box!.height / shellScale;
    expect(effectiveHeight, fixture.modalClass).toBeGreaterThan(340);
    expect(effectiveHeight, fixture.modalClass).toBeLessThanOrEqual(420);
  }
});

test("detects standalone small-screen desktop-UA PWA as a mobile app shell", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "android-standalone-no-touch-980");

  await expect
    .poll(() =>
      page.evaluate(() => ({
        htmlClasses: [...document.documentElement.classList],
        bodyClasses: [...document.body.classList],
        scale: getComputedStyle(document.documentElement).getPropertyValue("--club-app-wide-viewport-scale").trim()
      }))
    )
    .toMatchObject({
      htmlClasses: expect.arrayContaining(["club-android", "club-screen-short", "club-mobile-device", "club-mobile-app-scaled"]),
      bodyClasses: expect.arrayContaining(["club-android", "club-screen-short", "club-mobile-device", "club-mobile-app-scaled"]),
      scale: "2.545"
    });
});

test("uses the expected navigation for the detected device mode", async ({ page }, testInfo) => {
  const isDesktop = (page.viewportSize()?.width ?? 0) >= 1024;
  const sidebar = page.locator(".desktop-sidebar");
  const bottomNav = page.locator(".mobile-bottom-nav");

  if (isDesktop && testInfo.project.name === "desktop-chrome") {
    await expect(page.getByRole("dialog", { name: "Приложение оптимизировано для телефона" })).toBeVisible();
    await continuePastDeviceNotice(page);
    await expect(sidebar).toHaveCount(0);
    await expect(bottomNav).toBeVisible();
    await expect(page.locator(".app-root")).toHaveClass(/desktop-mobile-preview/);
  } else {
    await expect(sidebar).toHaveCount(0);
    await expect(bottomNav).toBeVisible();
  }

  await expectNoHorizontalOverflow(page);
});

test("keeps compact Android headers aligned to the PWA viewport", async ({ page }, testInfo) => {
  test.skip(!["huawei-nova-9-se", "oneplus-mt2111", "android-compact-320"].includes(testInfo.project.name));

  await expectPwaTopEdgeClear(page, ".section-head", { maxY: 38 });

  await page.getByRole("button", { name: "Модули" }).click();
  await expect(page.getByRole("heading", { name: "Модули" }).first()).toBeVisible();
  await expectPwaTopEdgeClear(page, ".admin-panel-head", { maxY: 38 });

  await page.getByRole("button", { name: "Оплата" }).click();
  await expect(page.getByRole("heading", { name: "Оплата" }).first()).toBeVisible();
  await expectPwaTopEdgeClear(page, ".section-head", { maxY: 38 });

  await page.getByRole("button", { name: "Общение" }).click();
  await page.getByRole("button", { name: /Фиксики/ }).click();
  await expect(page.getByRole("heading", { name: "Фиксики" })).toBeVisible();
  await expectPwaTopEdgeClear(page, ".chat-room-header", { maxY: 38 });
});

test("keeps Samsung chat header aligned to the PWA viewport", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "galaxy-s24");

  await page.getByRole("button", { name: "Общение" }).click();
  await page.getByRole("button", { name: /Фиксики/ }).click();
  await expect(page.getByRole("heading", { name: "Фиксики" })).toBeVisible();
  await expectPwaTopEdgeClear(page, ".chat-room-header", { maxY: 38 });
});

test("keeps database backup tools usable in the server admin panel", async ({ page }) => {
  await page.getByRole("button", { name: "Админ" }).click();
  await expect(page.getByRole("heading", { name: "Админка" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Сервер" }).click();
  await expect(page.getByRole("heading", { exact: true, name: "Сервер" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Скачать базу" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Восстановить базу" })).toBeVisible();
  await expect(page.getByPlaceholder("Введите ВОССТАНОВИТЬ")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("keeps the mailing task screen header and footer usable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "pixel-7");

  await page.getByRole("button", { name: "Админ" }).click();
  await page.getByRole("button", { name: "Рассылки" }).click();
  await page.getByRole("button", { name: "Новая рассылка" }).click();

  const taskScreen = page.locator(".admin-mailing-task-screen .task-screen");
  await expect(taskScreen).toBeVisible();
  const body = taskScreen.locator(".admin-mailing-builder-body");
  const footer = taskScreen.locator(".admin-mailing-builder-footer");
  await expect(body).toBeVisible();
  await expect(footer).toBeVisible();
  await expect(taskScreen.getByRole("button", { name: "Сбросить" })).toBeVisible();
  await expect(taskScreen.getByRole("button", { name: "Назад" })).toBeVisible();
  const dialogBox = await taskScreen.boundingBox();
  const footerBox = await footer.boundingBox();
  const viewport = page.viewportSize();
  expect(dialogBox?.y ?? -1).toBeGreaterThanOrEqual(0);
  expect(dialogBox?.y ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(32);
  expect(dialogBox?.width ?? 0).toBeGreaterThan((viewport?.width ?? 0) * 0.88);
  expect((footerBox?.y ?? 0) + (footerBox?.height ?? 0)).toBeLessThanOrEqual(viewport?.height ?? 0);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("mailing-composer.png"), fullPage: false });
});

test("keeps routed support tickets inside the mobile viewport", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "desktop-chrome");

  await page.getByRole("button", { name: "Поддержка" }).click();
  await page.locator(".support-admin-ticket, .support-ticket-card").first().click();

  const taskScreen = page.locator(".support-task-screen .task-screen");
  await expect(taskScreen).toBeVisible();
  await expect(page.getByRole("heading", { name: "Оплата" })).toBeVisible();
  await expect(page.getByPlaceholder("Ответ клиенту")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expect(page.locator(".support-message p").first()).toHaveCSS("font-size", "14px");
  await expect(page.locator(".support-message strong").first()).toHaveCSS("font-size", "13px");
  await expect(page.locator(".support-message small").first()).toHaveCSS("font-size", "12px");
  await expect(page.getByPlaceholder("Ответ клиенту")).toHaveCSS("font-size", "16px");

  const box = await taskScreen.boundingBox();
  const viewport = page.viewportSize();
  expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual((viewport?.width ?? 0) + 1);

  const replyFormBox = await page.locator(".support-reply-form").boundingBox();
  const replyInputBox = await page.getByPlaceholder("Ответ клиенту").boundingBox();
  const replyActionsBox = await page.locator(".support-reply-actions").boundingBox();
  expect(replyFormBox?.width ?? 0).toBeGreaterThan((viewport?.width ?? 0) * 0.88);
  expect(replyInputBox?.width ?? 0).toBeGreaterThan((viewport?.width ?? 0) * 0.66);
  expect(replyActionsBox?.width ?? 0).toBeGreaterThan((viewport?.width ?? 0) * 0.88);

  if (["pixel-7", "viewport-390-844"].includes(testInfo.project.name)) {
    await page.screenshot({ path: testInfo.outputPath("support-ticket-task.png"), fullPage: false });
    await page.evaluate(() => {
      document.documentElement.classList.add("club-keyboard-open");
      document.body.classList.add("club-keyboard-open");
      document.documentElement.style.setProperty("--club-visible-viewport-height", "520px");
      document.documentElement.style.setProperty("--club-system-bottom", "324px");
      document.documentElement.style.setProperty("--club-calibrated-bottom-offset", "324px");
    });
    await page.getByPlaceholder("Ответ клиенту").fill("Проверка ответа");
    await page.setViewportSize({ width: 390, height: 520 });
    await page.screenshot({ path: testInfo.outputPath("support-ticket-keyboard.png"), fullPage: false });
  }
});

test("uses the profile typography in chats and support on mobile", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "desktop-chrome");

  await page.getByRole("button", { name: "Общение" }).click();
  await page.getByRole("button", { name: /Фиксики/ }).click();
  await page.locator(".chat-messages").evaluate((element) => {
    element.insertAdjacentHTML(
      "beforeend",
      '<article data-typography-probe><header class="chat-message-head"><strong class="chat-message-author">Иван</strong><span>17.07, 19:55</span></header><p class="chat-message-body">Проверка сообщения</p></article>'
    );
  });
  await expect(page.locator(".chat-message-body").first()).toHaveCSS("font-size", "14px");
  await expect(page.locator(".chat-message-author").first()).toHaveCSS("font-size", "13px");
  await expect(page.locator(".chat-message-head").first()).toHaveCSS("font-size", "12px");
  await expect(page.locator(".chat-input-row .text-input")).toHaveCSS("font-size", "16px");

  await page.goto("/support/tickets/ticket-payment");
  await expect(page.locator(".support-message p").first()).toHaveCSS("font-size", "14px");
  await expect(page.locator(".support-message strong").first()).toHaveCSS("font-size", "13px");
  await expect(page.locator(".support-message small").first()).toHaveCSS("font-size", "12px");
  await expect(page.getByPlaceholder("Ответ клиенту")).toHaveCSS("font-size", "16px");

  const fontFamilies = await page.locator(".support-message p, .support-reply-form textarea").evaluateAll((elements) =>
    elements.map((element) => getComputedStyle(element).fontFamily)
  );
  expect(new Set(fontFamilies).size).toBe(1);
});

test("keeps application page headers aligned with the profile header", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "desktop-chrome");

  await page.goto("/profile");
  const profileTitle = page.locator(".profile-page-header .ui-page-header__title");
  const profileSubtitle = page.locator(".profile-page-header .ui-page-header__subtitle");
  await expect(profileTitle).toBeVisible();
  await expect(profileSubtitle).toBeVisible();

  const profileTypography = await profileTitle.evaluate((title, subtitleSelector) => {
    const subtitle = document.querySelector<HTMLElement>(subtitleSelector);
    const titleStyle = getComputedStyle(title);
    const subtitleStyle = subtitle ? getComputedStyle(subtitle) : null;
    return {
      titleSize: titleStyle.fontSize,
      titleWeight: titleStyle.fontWeight,
      titleLineHeight: titleStyle.lineHeight,
      subtitleSize: subtitleStyle?.fontSize,
      subtitleWeight: subtitleStyle?.fontWeight,
      subtitleLineHeight: subtitleStyle?.lineHeight
    };
  }, ".profile-page-header .ui-page-header__subtitle");

  expect(profileTypography).toMatchObject({
    titleWeight: "880",
    subtitleWeight: "650"
  });
  expect(Number.parseFloat(profileTypography.titleSize)).toBeGreaterThanOrEqual(16);
  expect(Number.parseFloat(profileTypography.subtitleSize || "0")).toBeGreaterThanOrEqual(10);
  expect(Number.parseFloat(profileTypography.titleLineHeight) / Number.parseFloat(profileTypography.titleSize)).toBeCloseTo(1.2, 2);
  expect(
    Number.parseFloat(profileTypography.subtitleLineHeight || "0") / Number.parseFloat(profileTypography.subtitleSize || "1")
  ).toBeCloseTo(1.35, 2);

  for (const path of ["/learning", "/community", "/payments", "/support", "/admin"]) {
    await page.goto(path);
    const title = page.locator(".section-head.ui-page-header .ui-page-header__title").first();
    const subtitle = page.locator(".section-head.ui-page-header .ui-page-header__subtitle").first();
    await expect(title, path).toBeVisible();
    await expect(subtitle, path).toBeVisible();
    await expect(title, path).toHaveCSS("font-size", profileTypography.titleSize);
    await expect(title, path).toHaveCSS("font-weight", profileTypography.titleWeight);
    await expect(subtitle, path).toHaveCSS("font-size", profileTypography.subtitleSize!);
    await expect(subtitle, path).toHaveCSS("font-weight", profileTypography.subtitleWeight!);
  }

  await page.goto("/support/new");
  await expect(page.locator(".task-screen-header .ui-page-header__title")).toHaveCSS("font-size", profileTypography.titleSize);
  await expect(page.locator(".task-screen-header .ui-page-header__subtitle")).toHaveCSS("font-size", profileTypography.subtitleSize!);

  await page.goto("/community");
  await page.getByRole("button", { name: /Фиксики/ }).click();
  await expect(page.locator(".chat-room-header-title")).toHaveCSS("font-size", profileTypography.titleSize);
  await expect(page.locator(".chat-room-header-subtitle")).toHaveCSS("font-size", profileTypography.subtitleSize!);
  await expectNoHorizontalOverflow(page);
});

test("returns from a support client card to the same ticket", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "desktop-chrome");

  await page.goto("/support/tickets/ticket-payment");
  const supportTask = page.locator(".support-ticket-task-screen .task-screen");
  await expect(supportTask).toBeVisible();

  await page.locator(".support-ticket-summary").click();
  await expect(page).toHaveURL(/\/support\/tickets\/ticket-payment\/clients\/593677751$/);
  const clientTask = page.locator(".admin-client-task-screen .task-screen");
  await expect(clientTask).toBeVisible();
  await expect(page.locator(".admin-shell-client-card-only .admin-tabs")).toBeHidden();

  await clientTask.getByRole("button", { name: "Назад" }).click();
  await expect(page).toHaveURL(/\/support\/tickets\/ticket-payment$/);
  await expect(supportTask).toBeVisible();
  await expect(page.getByRole("heading", { name: "Оплата" })).toBeVisible();
});

test("does not double-scroll iPhone support composers when focus opens the keyboard", async ({ page }, testInfo) => {
  test.skip(!["iphone-15-pro-max", "ios-safari-webkit"].includes(testInfo.project.name));

  for (const fixture of [
    { path: "/support/new", placeholder: "Напишите, что случилось и где именно." },
    { path: "/support/tickets/ticket-payment", placeholder: "Ответ клиенту" }
  ]) {
    await page.goto(fixture.path);
    const field = page.getByPlaceholder(fixture.placeholder);
    await expect(field).toBeVisible({ timeout: 12_000 });
    await expect(field).toHaveCSS("font-size", "16px");

    await field.evaluate((element) => {
      (window as Window & { __supportScrollIntoViewCalls?: number }).__supportScrollIntoViewCalls = 0;
      element.scrollIntoView = () => {
        (window as Window & { __supportScrollIntoViewCalls?: number }).__supportScrollIntoViewCalls =
          ((window as Window & { __supportScrollIntoViewCalls?: number }).__supportScrollIntoViewCalls ?? 0) + 1;
      };
      element.focus({ preventScroll: true });
    });
    await page.waitForTimeout(760);

    const forcedScrollCalls = await page.evaluate(
      () => (window as Window & { __supportScrollIntoViewCalls?: number }).__supportScrollIntoViewCalls ?? 0
    );
    expect(forcedScrollCalls, fixture.path).toBe(0);

    const visualViewportMetrics = await page.evaluate(() => {
      document.documentElement.classList.add("club-keyboard-open");
      document.body.classList.add("club-keyboard-open");
      document.documentElement.style.setProperty("--club-visible-viewport-top", "120px");
      document.documentElement.style.setProperty("--club-visible-viewport-height", "420px");
      const layer = document.querySelector<HTMLElement>(".support-task-screen.task-screen-route-layer");
      const footer = document.querySelector<HTMLElement>(".support-task-screen .task-screen-footer");
      const rect = (element: HTMLElement | null) => {
        const box = element?.getBoundingClientRect();
        return box ? { top: Math.round(box.top), bottom: Math.round(box.bottom) } : null;
      };
      return { layer: rect(layer), footer: rect(footer) };
    });
    expect(visualViewportMetrics.layer, fixture.path).toEqual({ top: 120, bottom: 540 });
    expect(visualViewportMetrics.footer?.bottom ?? 9999, fixture.path).toBeLessThanOrEqual(540);
  }
});

test("detects the iPhone keyboard when WebKit shrinks both live viewports", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-15-pro-max");

  await page.goto("/support/new");
  const field = page.getByPlaceholder("Напишите, что случилось и где именно.");
  await expect(field).toBeVisible({ timeout: 12_000 });
  await field.focus();

  const simulated = await page.evaluate(() => {
    const visualViewport = window.visualViewport;
    if (!visualViewport) {
      return false;
    }

    Object.defineProperty(window, "innerHeight", { configurable: true, value: 492 });
    Object.defineProperty(visualViewport, "height", { configurable: true, value: 492 });
    window.dispatchEvent(new Event("resize"));
    visualViewport.dispatchEvent(new Event("resize"));
    return true;
  });
  expect(simulated).toBe(true);
  await expect.poll(() => page.evaluate(() => document.body.classList.contains("club-keyboard-open"))).toBe(true);
});

test("opens support attachments above the routed ticket screen", async ({ page }, testInfo) => {
  await page.goto("/support/tickets/ticket-payment");
  const taskScreen = page.locator(".support-ticket-task-screen.task-screen-route-layer");
  await expect(taskScreen).toBeVisible();

  await page.getByRole("button", { name: /Открыть вложение/ }).click();
  const viewer = page.locator(".support-attachment-viewer");
  await expect(viewer).toBeVisible();
  const image = viewer.locator("img");
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(viewer.locator(".support-attachment-viewer-panel")).toHaveCount(0);
  const viewport = page.viewportSize();
  const viewerBox = await viewer.boundingBox();
  expect(viewerBox?.width ?? 0).toBeGreaterThanOrEqual((viewport?.width ?? 0) - 1);
  expect(viewerBox?.height ?? 0).toBeGreaterThanOrEqual((viewport?.height ?? 0) - 1);
  await image.dblclick();
  await expect(image).toHaveCSS("transform", /matrix\(2, 0, 0, 2/);

  const layers = await page.evaluate(() => ({
    task: Number.parseInt(getComputedStyle(document.querySelector<HTMLElement>(".support-ticket-task-screen.task-screen-route-layer")!).zIndex, 10),
    viewer: Number.parseInt(getComputedStyle(document.querySelector<HTMLElement>(".support-attachment-viewer")!).zIndex, 10)
  }));
  expect(layers.viewer).toBeGreaterThan(layers.task);
  await page.screenshot({ path: testInfo.outputPath("support-attachment-viewer.png"), fullPage: false });
});

test("opens the client message composer as a visible overlay", async ({ page }, testInfo) => {
  await page.goto("/admin/clients/593677751");
  await page.getByRole("button", { name: "Написать", exact: true }).click();

  const layer = page.locator(".admin-client-message-layer");
  await expect(layer).toBeVisible();
  const input = layer.getByPlaceholder("Напишите сообщение клиенту");
  await expect(input).toBeVisible();
  await expect(input).toBeFocused();
  const attachmentButton = layer.locator(".admin-client-file-button");
  await expect(attachmentButton).toBeVisible();
  await expect(attachmentButton.locator("svg")).toBeVisible();
  const modalBox = await layer.locator(".admin-client-message-modal").boundingBox();
  const viewport = page.viewportSize();
  expect(modalBox?.width ?? 0).toBeGreaterThanOrEqual((viewport?.width ?? 0) - 1);
  expect((modalBox?.y ?? 0) + (modalBox?.height ?? 0)).toBeGreaterThanOrEqual((viewport?.height ?? 0) - 1);
  await expect(page.locator(".admin-client-task-screen .task-screen-body .admin-client-message-modal")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("admin-client-message-overlay.png"), fullPage: false });
});

test("keeps support ticket composer anchored above keyboard in plain Samsung shells", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "android-wide-layout-980");

  await page.goto("/support/tickets/ticket-payment");
  await expect(page.locator(".support-ticket-task-screen .task-screen")).toBeVisible({ timeout: 12_000 });
  await expect(page.getByPlaceholder("Ответ клиенту")).toBeVisible();
  await forcePlainMobileDeviceShell(page);
  await page.evaluate(() => {
    document.documentElement.classList.add("club-keyboard-open");
    document.body.classList.add("club-keyboard-open");
    document.documentElement.style.setProperty("--club-visible-viewport-height", "620px");
    document.body.style.setProperty("--club-visible-viewport-height", "620px");
    document.documentElement.style.setProperty("--club-system-bottom", "360px");
    document.body.style.setProperty("--club-system-bottom", "360px");
    document.documentElement.style.setProperty("--club-calibrated-bottom-offset", "360px");
    document.body.style.setProperty("--club-calibrated-bottom-offset", "360px");
  });
  await page.getByPlaceholder("Ответ клиенту").fill("Проверка ответа");

  const metrics = await page.evaluate(() => {
    const task = document.querySelector<HTMLElement>(".support-ticket-task-screen .task-screen");
    const body = document.querySelector<HTMLElement>(".support-ticket-task-screen .task-screen-body");
    const footer = document.querySelector<HTMLElement>(".support-ticket-task-screen .task-screen-footer");
    const textarea = document.querySelector<HTMLElement>(".support-ticket-task-screen textarea");
    const rect = (element: HTMLElement | null) => {
      const box = element?.getBoundingClientRect();
      return box
        ? {
            top: Math.round(box.top),
            bottom: Math.round(box.bottom),
            height: Math.round(box.height),
            width: Math.round(box.width)
          }
        : null;
    };
    return {
      viewportWidth: document.documentElement.clientWidth,
      visibleHeight: 620,
      documentScrollWidth: document.documentElement.scrollWidth,
      task: rect(task),
      body: rect(body),
      footer: rect(footer),
      textarea: rect(textarea),
      footerPosition: footer ? getComputedStyle(footer).position : null
    };
  });

  expect(metrics.documentScrollWidth, JSON.stringify(metrics, null, 2)).toBeLessThanOrEqual(metrics.viewportWidth + 2);
  expect(metrics.task?.top, JSON.stringify(metrics, null, 2)).toBe(0);
  expect(metrics.task?.height, JSON.stringify(metrics, null, 2)).toBeLessThanOrEqual(metrics.visibleHeight + 1);
  expect(metrics.footer?.bottom, JSON.stringify(metrics, null, 2)).toBeGreaterThanOrEqual(metrics.visibleHeight - 2);
  expect(metrics.footer?.bottom, JSON.stringify(metrics, null, 2)).toBeLessThanOrEqual(metrics.visibleHeight + 2);
  expect(metrics.textarea?.bottom, JSON.stringify(metrics, null, 2)).toBeLessThanOrEqual(metrics.visibleHeight - 96);
});

test("matches full visual baselines for key screens", async ({ page }, testInfo) => {
  test.skip(!isFullVisualRun(testInfo), "Visual baselines run only in test:e2e:full");

  await expectStableScreenshot(page, "profile");

  if (testInfo.project.name === "desktop-chrome") {
    await expect(page.locator(".device-mode-notice-backdrop")).toHaveCount(0);
    return;
  }

  await page.getByRole("button", { name: "Модули" }).click();
  await expect(page.getByRole("heading", { name: "Модули" }).first()).toBeVisible();
  await expectStableScreenshot(page, "learning");

  await page.getByRole("button", { name: "Общение" }).click();
  await expect(page.getByRole("heading", { name: "Общение" }).first()).toBeVisible();
  await expectStableScreenshot(page, "community");
});

test("keeps module creation modal usable with a compact keyboard viewport", async ({ page }, testInfo) => {
  await page.getByRole("button", { name: "Модули" }).click();
  await page.getByRole("button", { name: "Добавить модуль" }).click();

  const dialog = page.locator(".learning-task-screen .module-editor-content");
  await expect(dialog).toBeVisible();
  await expect(page.getByLabel("Название модуля")).toBeVisible();
  await expect(page.getByLabel("Описание модуля")).toBeVisible();
  await expect(page.getByRole("group", { name: "Тип карточек модуля" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  if (testInfo.project.name === "pixel-7") {
    await page.screenshot({ path: testInfo.outputPath("module-modal.png"), fullPage: false });
    await page.evaluate(() => {
      document.documentElement.dataset.theme = "light";
    });
    await page.screenshot({ path: testInfo.outputPath("module-modal-light.png"), fullPage: false });
  }

  await page.evaluate(() => {
    document.documentElement.style.setProperty("--club-visible-viewport-height", "420px");
    document.body.style.setProperty("--club-visible-viewport-height", "420px");
    document.documentElement.classList.add("club-keyboard-open");
    document.body.classList.add("club-keyboard-open");
  });
  await page.getByLabel("Название модуля").fill("Демо модуль");
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--club-visible-viewport-height", "420px");
    document.body.style.setProperty("--club-visible-viewport-height", "420px");
    document.documentElement.classList.add("club-keyboard-open");
    document.body.classList.add("club-keyboard-open");
  });

  const dialogBox = await dialog.boundingBox();
  const dialogHeight = await dialog.evaluate((element) => Number.parseFloat(window.getComputedStyle(element).height));
  expect(dialogBox?.y ?? -1).toBeGreaterThanOrEqual(0);
  expect(dialogHeight).toBeLessThanOrEqual(420);
  await expect(page.getByRole("button", { name: "Сохранить модуль" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("separates the complete developer surface from an administrator with all permissions", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "pixel-7");

  await page.goto("/admin");
  for (const panel of ["Аналитика", "Клиенты", "Рассылки", "Платежи", "Хранилище", "Настройки проекта", "Админы", "Сервер"]) {
    await expect(page.getByRole("button", { name: panel, exact: true })).toBeVisible();
  }
  await page.goto("/admin/releases");
  await expect(page.locator(".release-notes-modal")).toBeVisible();
  await page.goto("/admin/owner/transfer");
  await expect(page.locator(".admin-task-screen .task-screen")).toBeVisible();

  const fullAdmin = {
    ...currentUser,
    id: "admin-full-audit",
    telegramId: "admin-full-audit",
    role: "admin" as const,
    realRole: "admin" as const,
    adminRoleLabel: "Контент-администратор",
    adminPermissions: [
      "statistics", "users", "accesses", "mailings", "payments", "materials", "support", "community", "storage", "admins", "login_ips", "project_settings"
    ]
  };
  await page.unroute(`${apiBaseUrl}/**`);
  await page.unroute(appApiUrlPattern);
  await mockApi(page, fullAdmin);
  await page.evaluate(() => localStorage.setItem("club-preview-mode", "developer"));
  await page.goto("/admin");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("club-preview-mode"))).toBe("admin");

  for (const panel of ["Аналитика", "Клиенты", "Рассылки", "Платежи", "Хранилище", "Настройки проекта", "Админы"]) {
    await expect(page.getByRole("button", { name: panel, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Сервер", exact: true })).toHaveCount(0);
  await page.goto("/admin/releases");
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/admin/owner/transfer");
  await expect(page).toHaveURL(/\/admin$/);
});

test("creates, edits, deletes, and restores a module lesson with every content element", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "pixel-7");
  test.setTimeout(90_000);

  const categories = [{ ...adminLearningCategory }];
  const deletedCategories: Array<Record<string, unknown>> = [];
  const materials = [{ ...adminLearningMaterial }];
  const deletedMaterials: typeof materials = [];
  const mutationLog: Array<{ method: string; path: string; payload?: unknown }> = [];

  await page.route(/\/api\/admin\/learning(?:\/.*)?$|\/admin\/learning(?:\/.*)?$/, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/api/, "");
    const method = request.method();

    if (path === "/admin/learning" && method === "GET") {
      await route.fulfill(json({ categories, deletedCategories, materials, deletedMaterials }));
      return;
    }
    if (path === "/admin/learning/categories" && method === "POST") {
      const payload = request.postDataJSON() as { title: string; description?: string | null; defaultCardLayout: "vertical" | "horizontal"; isPublished?: boolean };
      const category = {
        id: "audit-module",
        slug: "audit-module",
        title: payload.title,
        description: payload.description ?? null,
        defaultCardLayout: payload.defaultCardLayout,
        isPublished: payload.isPublished ?? false,
        itemsCount: 0,
        archivedUntil: null
      };
      categories.push(category);
      mutationLog.push({ method, path, payload });
      await route.fulfill(json({ ok: true, category }));
      return;
    }
    if (path === "/admin/learning/categories/audit-module" && method === "POST") {
      const payload = request.postDataJSON() as { title: string; description?: string | null; defaultCardLayout: "vertical" | "horizontal"; isPublished?: boolean };
      const category = categories.find((item) => item.id === "audit-module")!;
      Object.assign(category, payload);
      mutationLog.push({ method, path, payload });
      await route.fulfill(json({ ok: true, category }));
      return;
    }
    if (path === "/admin/learning/categories/audit-module" && method === "DELETE") {
      const index = categories.findIndex((item) => item.id === "audit-module");
      const [category] = categories.splice(index, 1);
      deletedCategories.unshift({ ...category, isPublished: false, archivedUntil: "2026-08-02T10:00:00.000Z" });
      mutationLog.push({ method, path });
      await route.fulfill(json({ ok: true }));
      return;
    }
    if (path === "/admin/learning/categories/audit-module/restore" && method === "POST") {
      const index = deletedCategories.findIndex((item) => item.id === "audit-module");
      const [category] = deletedCategories.splice(index, 1);
      const restored = { ...category, isPublished: false, archivedUntil: null };
      categories.push(restored as typeof adminLearningCategory);
      mutationLog.push({ method, path });
      await route.fulfill(json({ ok: true, category: restored }));
      return;
    }
    if (path === "/admin/learning/materials/direct" && method === "POST") {
      const payload = request.postDataJSON() as Record<string, unknown> & { title: string; kind: "text" | "photo" | "video" | "audio"; materials: typeof adminLearningMaterial.materials };
      const material = {
        ...adminLearningMaterial,
        id: "audit-lesson",
        categoryId: "audit-module",
        title: payload.title,
        kind: payload.kind,
        summary: String(payload.summary ?? ""),
        body: String(payload.body ?? ""),
        mediaUrl: (payload.mediaUrl as string | null | undefined) ?? null,
        mediaSource: payload.mediaUrl ? "external" : null,
        materials: payload.materials,
        cardLayout: "horizontal",
        isPublished: Boolean(payload.isPublished)
      };
      materials.push(material);
      mutationLog.push({ method, path, payload });
      await route.fulfill(json({ ok: true, material }));
      return;
    }
    if (path === "/admin/learning/materials/audit-lesson/direct" && method === "POST") {
      const payload = request.postDataJSON() as Record<string, unknown> & { title: string; materials: typeof adminLearningMaterial.materials };
      const material = materials.find((item) => item.id === "audit-lesson")!;
      Object.assign(material, { title: payload.title, summary: payload.summary, body: payload.body, materials: payload.materials });
      mutationLog.push({ method, path, payload });
      await route.fulfill(json({ ok: true, material }));
      return;
    }
    if (path === "/admin/learning/materials/audit-lesson" && method === "DELETE") {
      const index = materials.findIndex((item) => item.id === "audit-lesson");
      const [material] = materials.splice(index, 1);
      deletedMaterials.unshift({ ...material, archivedUntil: "2026-08-02T10:00:00.000Z" });
      mutationLog.push({ method, path });
      await route.fulfill(json({ ok: true }));
      return;
    }
    if (path === "/admin/learning/materials/audit-lesson/restore" && method === "POST") {
      const index = deletedMaterials.findIndex((item) => item.id === "audit-lesson");
      const [material] = deletedMaterials.splice(index, 1);
      const restored = { ...material, archivedUntil: null };
      materials.push(restored);
      mutationLog.push({ method, path });
      await route.fulfill(json({ ok: true, material: restored }));
      return;
    }

    await route.fallback();
  });

  await page.goto("/learning");
  await page.getByRole("button", { name: "Редактировать модули" }).click();
  await page.getByRole("button", { name: "Добавить модуль" }).click();
  await expect(page.getByLabel("Опубликовать модуль")).not.toBeChecked();
  await page.getByLabel("Название модуля").fill("Аудит: полный модуль");
  await page.getByLabel("Описание модуля").fill("Проверка всех типов содержимого");
  await page.getByRole("button", { name: "Горизонтальные уроки" }).click();
  await page.getByRole("button", { name: "Сохранить модуль" }).click();
  await expect(page.getByText("Аудит: полный модуль", { exact: true })).toBeVisible();
  expect((mutationLog.find((entry) => entry.path === "/admin/learning/categories")?.payload as { isPublished: boolean }).isPublished).toBe(false);

  await page.getByRole("button", { name: "Переключить Аудит: полный модуль" }).click();
  await page.getByRole("button", { name: "Добавить карточку в Аудит: полный модуль" }).click();
  await expect(page.getByLabel("Опубликовать урок")).not.toBeChecked();
  await page.getByLabel("Название урока").fill("Урок со всеми материалами");
  await page.getByLabel("Описание урока").fill("Текст, фото, видео и аудио");
  await page.getByLabel("Содержимое урока").fill("Основной текст урока");
  await page.getByRole("button", { name: "Первое вложение" }).click();

  for (let index = 0; index < 4; index += 1) {
    await page.getByRole("button", { name: "Добавить ещё материал" }).click();
  }
  const extraCards = page.locator(".lesson-extra-card");
  await expect(extraCards).toHaveCount(4);
  await extraCards.nth(0).getByLabel("Необязательный текст дополнительного материала").fill("Текстовая заметка");

  await extraCards.nth(1).getByRole("button", { name: "Фото" }).click();
  await extraCards.nth(1).getByRole("button", { name: "Ссылка" }).click();
  await extraCards.nth(1).getByLabel("Ссылка на файл материала").fill("https://cdn.example.com/audit-photo.jpg");
  await extraCards.nth(1).getByLabel("Необязательный текст дополнительного материала").fill("Подпись к фото");

  await extraCards.nth(2).getByRole("button", { name: "Видео" }).click();
  await extraCards.nth(2).getByRole("button", { name: "YouTube" }).click();
  await extraCards.nth(2).getByLabel("Ссылка YouTube").fill("https://youtu.be/dQw4w9WgXcQ");
  await extraCards.nth(2).getByLabel("Необязательный текст дополнительного материала").fill("Подпись к видео");

  await extraCards.nth(3).getByRole("button", { name: "Аудио" }).click();
  await extraCards.nth(3).getByRole("button", { name: "Ссылка" }).click();
  await extraCards.nth(3).getByLabel("Ссылка на файл материала").fill("https://cdn.example.com/audit-audio.mp3");
  await extraCards.nth(3).getByLabel("Необязательный текст дополнительного материала").fill("Подпись к аудио");

  await page.getByRole("button", { name: "Сохранить урок" }).click();
  await expect(page).toHaveURL(/\/learning$/);
  const createPayload = mutationLog.find((entry) => entry.path === "/admin/learning/materials/direct")?.payload as { isPublished: boolean; materials: Array<{ kind: string; mediaUrl?: string | null }> };
  expect(createPayload.isPublished).toBe(false);
  expect(createPayload.materials.map((item) => item.kind)).toEqual(["text", "photo", "video", "audio"]);
  expect(createPayload.materials.map((item) => item.mediaUrl ?? null)).toEqual([
    null,
    "https://cdn.example.com/audit-photo.jpg",
    "https://youtu.be/dQw4w9WgXcQ",
    "https://cdn.example.com/audit-audio.mp3"
  ]);

  await page.goto("/learning/lessons/audit-lesson/edit");
  await page.getByLabel("Название урока").fill("Урок обновлён");
  await page.getByRole("button", { name: "Сохранить урок" }).click();
  await expect(mutationLog.some((entry) => entry.path === "/admin/learning/materials/audit-lesson/direct")).toBe(true);

  await page.goto("/learning/lessons/audit-lesson/edit");
  await page.getByRole("button", { name: "Удалить урок" }).click();
  await page.getByRole("alertdialog", { name: "Удалить урок «Урок обновлён»?" }).getByRole("button", { name: "Удалить урок", exact: true }).click();
  await expect(mutationLog.some((entry) => entry.method === "DELETE" && entry.path === "/admin/learning/materials/audit-lesson")).toBe(true);
  await page.getByRole("button", { name: "Редактировать модули" }).click();
  await page.getByRole("button", { name: "Переключить Удалённый контент" }).click();
  await page.getByRole("button", { name: "Восстановить Урок обновлён" }).click();
  await expect(mutationLog.some((entry) => entry.path === "/admin/learning/materials/audit-lesson/restore")).toBe(true);

  await page.goto("/learning/modules/audit-module/edit");
  await page.getByLabel("Название модуля").fill("Аудит: модуль обновлён");
  await page.getByRole("button", { name: "Сохранить модуль" }).click();
  await expect(mutationLog.some((entry) => entry.path === "/admin/learning/categories/audit-module" && entry.method === "POST")).toBe(true);
  await page.goto("/learning/modules/audit-module/edit");
  await page.getByRole("button", { name: "Удалить модуль" }).click();
  await page.getByRole("alertdialog", { name: "Удалить модуль «Аудит: модуль обновлён»?" }).getByRole("button", { name: "Удалить модуль", exact: true }).click();
  await expect(mutationLog.some((entry) => entry.path === "/admin/learning/categories/audit-module" && entry.method === "DELETE")).toBe(true);
  await page.getByRole("button", { name: "Редактировать модули" }).click();
  await page.getByRole("button", { name: "Развернуть Удалённый контент" }).click();
  await page.getByRole("button", { name: "Восстановить модуль Аудит: модуль обновлён" }).click();
  await expect(mutationLog.some((entry) => entry.path === "/admin/learning/categories/audit-module/restore" && entry.method === "POST")).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => document.documentElement.clientWidth + 2)
  );
});

test("keeps lesson editor task screen inside the mobile viewport", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "desktop-chrome");

  await page.getByRole("button", { name: "Модули" }).click();
  await page.getByRole("button", { name: "Добавить урок в Модуль 1" }).click();

  const taskScreen = page.locator(".learning-task-screen .task-screen");
  const editor = page.locator(".learning-task-screen .lesson-preview-modal-edit");
  await expect(taskScreen).toBeVisible();
  await expect(page.getByRole("heading", { name: "Новый урок" })).toBeVisible();
  await expect(page.getByLabel("Название урока")).toBeVisible();
  await expect(page.getByText("Вертикальная карточка")).toBeVisible();
  await expectNoHorizontalOverflow(page);

  const box = await editor.boundingBox();
  const viewport = page.viewportSize();
  expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual((viewport?.width ?? 0) + 1);

  if (testInfo.project.name === "pixel-7") {
    await page.screenshot({ path: testInfo.outputPath("lesson-editor-task.png"), fullPage: false });
  }
});

test("keeps chat composer stable when typing", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "desktop-chrome");

  await page.getByRole("button", { name: "Общение" }).click();
  await page.getByRole("button", { name: /Фиксики/ }).click();
  await expect(page.getByRole("heading", { name: "Фиксики" })).toBeVisible();
  await expectChatComposerCompactRow(page);

  if (testInfo.project.name === "viewport-390-844") {
    await page.screenshot({ path: testInfo.outputPath("chat-compact.png"), fullPage: false, animations: "disabled", caret: "hide" });
  }

  const composer = page.getByPlaceholder("Сообщение");
  await composer.fill("Проверка адаптива");
  await expect(composer).toBeFocused();
  await expectChatComposerCompactRow(page);

  await page.evaluate(() => {
    const isScaledShell = document.documentElement.classList.contains("club-mobile-app-scaled");
    const shellScale = isScaledShell
      ? Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--club-app-wide-viewport-scale")) || 1
      : 1;
    document.documentElement.classList.add("club-keyboard-open");
    document.body.classList.add("club-keyboard-open");
    document.documentElement.style.setProperty("--club-visible-viewport-height", `${420 * shellScale}px`);
    document.body.style.setProperty("--club-visible-viewport-height", `${420 * shellScale}px`);
    document.documentElement.style.setProperty("--club-system-bottom", `${360 * shellScale}px`);
    document.body.style.setProperty("--club-system-bottom", `${360 * shellScale}px`);
    document.documentElement.style.setProperty("--club-calibrated-bottom-offset", `${360 * shellScale}px`);
    document.body.style.setProperty("--club-calibrated-bottom-offset", `${360 * shellScale}px`);
  });
  await composer.focus();
  await expectChatComposerCompactRow(page);
  await expectNoHorizontalOverflow(page);

  const composerBox = await composer.boundingBox();
  expect(composerBox?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((composerBox?.x ?? 0) + (composerBox?.width ?? 0)).toBeLessThanOrEqual(page.viewportSize()!.width);

  if (testInfo.project.name === "viewport-390-844") {
    await page.screenshot({ path: testInfo.outputPath("chat-compact-keyboard.png"), fullPage: false, animations: "disabled", caret: "hide" });
  }
});
