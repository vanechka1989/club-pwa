import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { expect, test, type Page, type Route, type TestInfo } from "@playwright/test";
import { pwaUiScreenshotViewports } from "./pwa-ui-routes";

const require = createRequire(import.meta.url);
const apiBaseUrl = "http://localhost:3000";
const appApiUrlPattern = /^https?:\/\/(?:127\.0\.0\.1|localhost):\d+\/api\/.*/;
const now = "2026-07-01T10:00:00.000Z";
const activeUntil = "2026-08-30T00:00:00.000Z";

const currentUser = {
  id: "user-owner",
  telegramId: "593677751",
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
      attachments: [],
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
  username: "client.with.very.long.email.like.name@example.com",
  role: "member",
  membershipStatus: "inactive",
  membershipExpiresAt: null,
  tariff: null,
  hasRestrictions: true,
  completedItems: 0,
  totalItems: 9,
  lastOpenedItemTitle: null,
  telegramBotStatus: "blocked",
  telegramBotBlockedAt: now,
  createdAt: "2026-06-15T10:00:00.000Z"
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
  sentCount: 17,
  failedCount: 1,
  skippedCount: 0,
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

async function mockApi(page: Page) {
  const handleApiRoute = async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.startsWith("/api/") ? url.pathname.slice(4) : url.pathname;

    if (path === "/me") {
      await route.fulfill(json({ user: currentUser }));
      return;
    }

    if (path === "/me/device" && request.method() === "POST") {
      await route.fulfill(json({ ok: true, user: currentUser }));
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
              createdAt: now,
              updatedAt: now
            }
          ],
          recurrentSubscriptions: []
        })
      );
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
            serverErrorCount: 0
          }
        })
      );
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
          totalUsers: 2,
          activeUsers: 1,
          completedItems: 4,
          totalItems: 18,
          users: [adminStatsUser, inactiveStatsUser],
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
      await route.fulfill(json({ mailings: [adminMailing] }));
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

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const scrollWidth = document.documentElement.scrollWidth;
    const offenders = Array.from(document.body.querySelectorAll<HTMLElement>("*"))
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
  });

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

async function expectChatComposerSingleRow(page: Page) {
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
        buttonRects.length === 2 &&
        buttonRects.every((rect) => Math.abs(rect.top - Math.round(inputRect!.top)) <= 8),
      isScaledShell,
      shellScale,
      buttonsUsable: buttonRects.length === 2 && buttonRects.every((rect) => rect.effectiveWidth >= 44 && rect.effectiveHeight >= 44),
      iconsReadable: buttonRects.length === 2 && buttonRects.every((rect) => (rect.effectiveSvgWidth ?? 0) >= 16 && (rect.effectiveSvgHeight ?? 0) >= 16),
      messagesScrollableWhenOverflowing: Boolean(
        messages && (messages.scrollHeight <= messages.clientHeight + 4 || messages.scrollTop > 0)
      ),
      composerWithinVisibleViewport: Boolean(
        composerRect && composerRect.top >= -1 && composerRect.bottom <= visibleViewportHeight + 1
      )
    };
  });

  expect(layout, JSON.stringify(layout, null, 2)).toMatchObject({
    display: "flex",
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
  "push-permission-card",
  "admin-client-message-modal"
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
      <article class="notification-center-item soft-card" style="margin: 1rem;">
        <header>
          <strong>Ответ поддержки</strong>
          <time>07.07, 21:14</time>
        </header>
        <p>Контент внутри модалки тоже не должен создавать горизонтальный скролл.</p>
      </article>
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
  await expectNoHorizontalOverflow(page);
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

const responsiveRouteAuditProjects = new Set(["android-compact-320", "oneplus-mt2111", "viewport-390-844", "viewport-412-915", "tablet-768-1024"]);
const wideMobilePwaRouteAuditProjects = new Set(["android-wide-layout-980", "android-standalone-no-touch-980"]);

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

test("keeps core sections inside the mobile viewport", async ({ page }) => {
  await expectNoHorizontalOverflow(page);

  for (const section of ["Модули", "Общение", "Оплата", "Поддержка"]) {
    await page.getByRole("button", { name: section }).click();
    await expect(page.getByRole("heading", { name: section }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
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
  await expectChatComposerSingleRow(page);

  await page.goto("/payments");
  await expect(page.getByRole("heading", { name: "Оплата" }).first()).toBeVisible();
  await expectConsistentIconActionTargets(
    page,
    "payments add and tariff admin actions",
    iconActionControlSelector
  );
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

test("keeps routed PWA screens responsive across exact desktop audit sizes", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chrome");
  test.setTimeout(240_000);

  for (const viewport of exactDesktopAuditViewports) {
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
  const root = page.locator("html");
  const dayButton = page.getByRole("button", { name: "День", exact: true });
  const nightButton = page.getByRole("button", { name: "Ночь", exact: true });
  const designThemes = [
    { name: /Dark Soft Touch Premium/, value: "dark-soft-touch", lightBg: "#eef4fb", darkBg: "#080d16" },
    { name: /Graphite \+ Electric Blue/, value: "graphite-electric-blue", lightBg: "#eef3f9", darkBg: "#070b12" },
    { name: /Pine Teal/, value: "pine-teal", lightBg: "#edf5f0", darkBg: "#06110d" },
    { name: /Warm Clay/, value: "warm-clay", lightBg: "#f2ece4", darkBg: "#120d09" },
    { name: /Plum Rose/, value: "plum-rose", lightBg: "#f4edf5", darkBg: "#100812" }
  ] as const;

  for (const designTheme of designThemes) {
    const designThemeButton = page.getByRole("button", { name: designTheme.name });
    await expect(designThemeButton).toHaveCount(1);
    await designThemeButton.scrollIntoViewIfNeeded();
    await designThemeButton.click();
    await expect(root).toHaveAttribute("data-design-theme", designTheme.value);

    for (const mode of [
      { value: "light", button: dayButton, expectedBg: designTheme.lightBg },
      { value: "dark", button: nightButton, expectedBg: designTheme.darkBg }
    ] as const) {
      await mode.button.click();
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

test("uses Warm Clay day and protects mobile scale from accidental swipes", async ({ page }) => {
  const root = page.locator("html");
  await expect(root).toHaveAttribute("data-theme", "light");
  await expect(root).toHaveAttribute("data-design-theme", "warm-clay");

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

test("uses the desktop sidebar only above the app breakpoint", async ({ page }) => {
  const isDesktop = (page.viewportSize()?.width ?? 0) >= 1024;
  const sidebar = page.locator(".desktop-sidebar");
  const bottomNav = page.locator(".mobile-bottom-nav");

  if (isDesktop) {
    await expect(sidebar).toBeVisible();
    await expect(bottomNav).toHaveCount(0);
    await expect(page.locator(".app-layout")).toHaveCSS("display", "grid");
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

  const dialog = page.getByRole("dialog", { name: "Новый модуль" });
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

test("keeps lesson editor task screen inside the mobile viewport", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "desktop-chrome");

  await page.getByRole("button", { name: "Модули" }).click();
  await page.getByRole("button", { name: "Переключить Модуль 1" }).click();
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
  await page.getByRole("button", { name: "Общение" }).click();
  await page.getByRole("button", { name: /Фиксики/ }).click();
  await expect(page.getByRole("heading", { name: "Фиксики" })).toBeVisible();
  await expectChatComposerSingleRow(page);

  if (testInfo.project.name === "viewport-390-844") {
    await page.screenshot({ path: testInfo.outputPath("chat-compact.png"), fullPage: false, animations: "disabled", caret: "hide" });
  }

  const composer = page.getByPlaceholder("Сообщение");
  await composer.fill("Проверка адаптива");
  await expect(composer).toBeFocused();
  await expectChatComposerSingleRow(page);

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
  await expectChatComposerSingleRow(page);
  await expectNoHorizontalOverflow(page);

  const composerBox = await composer.boundingBox();
  expect(composerBox?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((composerBox?.x ?? 0) + (composerBox?.width ?? 0)).toBeLessThanOrEqual(page.viewportSize()!.width);

  if (testInfo.project.name === "viewport-390-844") {
    await page.screenshot({ path: testInfo.outputPath("chat-compact-keyboard.png"), fullPage: false, animations: "disabled", caret: "hide" });
  }
});
