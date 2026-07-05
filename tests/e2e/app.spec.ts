import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { expect, test, type Page, type Route, type TestInfo } from "@playwright/test";

const require = createRequire(import.meta.url);
const apiBaseUrl = "http://localhost:3000";
const appApiUrlPattern = /^https?:\/\/(?:127\.0\.0\.1|localhost):5173\/api\/.*/;
const now = "2026-07-01T10:00:00.000Z";
const activeUntil = "2026-08-30T00:00:00.000Z";

const currentUser = {
  id: "user-owner",
  telegramId: "593677751",
  firstName: "Екатерина",
  username: "katya",
  photoUrl: null,
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

async function mockTelegram(page: Page, testInfo: TestInfo) {
  const isHuawei = testInfo.project.name.includes("huawei");
  const isIos = testInfo.project.name.includes("iphone");
  const platform = isIos ? "ios" : "android";

  await page.addInitScript(
    ({ isHuawei: huawei, platform: telegramPlatform }) => {
      const topInset = huawei ? 35.333332 : telegramPlatform === "ios" ? 59 : 34.133335;

      Object.defineProperty(window, "Telegram", {
        configurable: true,
        value: {
          WebApp: {
            initData: "e2e-init-data",
            version: "9.6",
            platform: telegramPlatform,
            isFullscreen: true,
            viewportHeight: window.innerHeight,
            viewportStableHeight: window.innerHeight,
            safeAreaInset: { top: topInset, bottom: telegramPlatform === "ios" ? 34 : 0, left: 0, right: 0 },
            contentSafeAreaInset: { top: topInset + 11, bottom: 0, left: 0, right: 0 },
            ready() {},
            expand() {},
            requestFullscreen() {
              this.isFullscreen = true;
            },
            exitFullscreen() {
              this.isFullscreen = false;
            },
            disableVerticalSwipes() {},
            enableVerticalSwipes() {},
            showAlert() {},
            showConfirm(_message: string, callback: (isConfirmed: boolean) => void) {
              callback(true);
            }
          }
        }
      });
    },
    { isHuawei, platform }
  );
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

    if (path === "/payments/orders") {
      await route.fulfill(json({ orders: [] }));
      return;
    }

    if (path === "/payments/plans") {
      await route.fulfill(json({ plans: [], provider: null, products: [], recurrentSubscriptions: [] }));
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
          tickets: [],
          unreadCount: 0
        })
      );
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

async function openApp(page: Page, testInfo: TestInfo) {
  await mockTelegram(page, testInfo);
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

async function expectTelegramTopControlsClear(
  page: Page,
  selector: string,
  options: { minY?: number; maxY?: number } = {}
) {
  const target = page.locator(selector).first();
  await expect(target).toBeVisible();

  const targetBox = await target.boundingBox();
  const y = targetBox?.y ?? 0;
  expect(y).toBeGreaterThanOrEqual(options.minY ?? 112);
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

test("renders the mini app shell without accessibility violations", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Профиль" })).toBeVisible();

  await page.addScriptTag({
    content: readFileSync(require.resolve("axe-core/axe.min.js"), "utf8")
  });

  const results = await page.evaluate(async () => {
    return window.axe.run(document, {
      rules: {
        "color-contrast": { enabled: false }
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

test("keeps compact Android headers below Telegram top controls", async ({ page }, testInfo) => {
  test.skip(!["huawei-nova-9-se", "oneplus-mt2111", "android-compact-320"].includes(testInfo.project.name));

  await expectTelegramTopControlsClear(page, ".section-head", { minY: 96, maxY: 110 });

  await page.getByRole("button", { name: "Модули" }).click();
  await expect(page.getByRole("heading", { name: "Модули" }).first()).toBeVisible();
  await expectTelegramTopControlsClear(page, ".admin-panel-head", { minY: 96, maxY: 110 });

  await page.getByRole("button", { name: "Оплата" }).click();
  await expect(page.getByRole("heading", { name: "Оплата" }).first()).toBeVisible();
  await expectTelegramTopControlsClear(page, ".section-head", { minY: 96, maxY: 110 });

  await page.getByRole("button", { name: "Общение" }).click();
  await page.getByRole("button", { name: /Фиксики/ }).click();
  await expect(page.getByRole("heading", { name: "Фиксики" })).toBeVisible();
  await expectTelegramTopControlsClear(page, ".chat-room-header");
});

test("keeps Samsung chat header below Telegram top controls", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "galaxy-s24");

  await page.getByRole("button", { name: "Общение" }).click();
  await page.getByRole("button", { name: /Фиксики/ }).click();
  await expect(page.getByRole("heading", { name: "Фиксики" })).toBeVisible();
  await expectTelegramTopControlsClear(page, ".chat-room-header");
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

test("keeps module creation modal usable with a compact keyboard viewport", async ({ page }) => {
  await page.getByRole("button", { name: "Модули" }).click();
  await page.getByRole("button", { name: "Добавить модуль" }).click();

  const dialog = page.getByRole("dialog", { name: "Новый модуль" });
  await expect(dialog).toBeVisible();
  await expect(page.getByLabel("Название модуля")).toBeVisible();
  await expect(page.getByLabel("Описание модуля")).toBeVisible();
  await expect(page.getByRole("group", { name: "Тип карточек модуля" })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.evaluate(() => {
    document.documentElement.style.setProperty("--club-visible-viewport-height", "420px");
    document.body.classList.add("club-keyboard-open");
  });
  await page.getByLabel("Название модуля").fill("Демо модуль");

  const dialogBox = await dialog.boundingBox();
  expect(dialogBox?.y ?? -1).toBeGreaterThanOrEqual(0);
  expect((dialogBox?.y ?? 0) + (dialogBox?.height ?? 0)).toBeLessThanOrEqual(422);
  await expect(page.getByRole("button", { name: "Сохранить модуль" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("keeps chat composer stable when typing", async ({ page }) => {
  await page.getByRole("button", { name: "Общение" }).click();
  await page.getByRole("button", { name: /Фиксики/ }).click();
  await expect(page.getByRole("heading", { name: "Фиксики" })).toBeVisible();

  const composer = page.getByPlaceholder("Сообщение");
  await composer.fill("Проверка адаптива");
  await expect(composer).toBeFocused();
  await expectNoHorizontalOverflow(page);

  const composerBox = await composer.boundingBox();
  expect(composerBox?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((composerBox?.x ?? 0) + (composerBox?.width ?? 0)).toBeLessThanOrEqual(page.viewportSize()!.width);
});
