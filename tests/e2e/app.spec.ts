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

    if (path === "/admin/admins") {
      await route.fulfill(json({ ownerTelegramId: currentUser.telegramId, admins: [] }));
      return;
    }

    if (path === "/admin/stats") {
      await route.fulfill(json({ users: [], communityMessages: [] }));
      return;
    }

    if (path === "/admin/learning") {
      await route.fulfill(json({ categories: [], materials: [] }));
      return;
    }

    if (path === "/payments/admin/orders") {
      await route.fulfill(json({ orders: [] }));
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
      await route.fulfill(json({ mailings: [] }));
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
    await page.evaluate(() => {
      document.documentElement.classList.add("club-keyboard-open");
      document.body.classList.add("club-keyboard-open");
      document.documentElement.style.setProperty("--club-visible-viewport-height", "420px");
      document.documentElement.style.setProperty("--club-system-bottom", "360px");
      document.documentElement.style.setProperty("--club-calibrated-bottom-offset", "360px");
    });

    const box = await page.locator("[data-modal-fixture-panel]").boundingBox();
    expect(box, fixture.modalClass).not.toBeNull();
    expect(box!.height, fixture.modalClass).toBeGreaterThan(340);
    expect(box!.height, fixture.modalClass).toBeLessThanOrEqual(420);
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
      htmlClasses: expect.arrayContaining(["club-screen-tall", "club-mobile-device", "club-mobile-app-scaled"]),
      bodyClasses: expect.arrayContaining(["club-screen-tall", "club-mobile-device", "club-mobile-app-scaled"]),
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

test("keeps the mailing composer header and footer usable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "pixel-7");

  await page.getByRole("button", { name: "Админ" }).click();
  await page.getByRole("button", { name: "Рассылки" }).click();
  await page.getByRole("button", { name: "Новая рассылка" }).click();

  const dialog = page.getByRole("dialog", { name: "Новая рассылка" });
  await expect(dialog).toBeVisible();
  const body = dialog.locator(".admin-mailing-builder-body");
  const footer = dialog.locator(".admin-mailing-builder-footer");
  await expect(body).toBeVisible();
  await expect(footer).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Сбросить" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Закрыть рассылку" })).toBeVisible();
  const dialogBox = await dialog.boundingBox();
  const footerBox = await footer.boundingBox();
  const viewport = page.viewportSize();
  expect(dialogBox?.y ?? -1).toBeGreaterThanOrEqual(0);
  expect(dialogBox?.y ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(32);
  expect(dialogBox?.width ?? 0).toBeGreaterThan((viewport?.width ?? 0) * 0.88);
  expect((footerBox?.y ?? 0) + (footerBox?.height ?? 0)).toBeLessThanOrEqual(viewport?.height ?? 0);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("mailing-composer.png"), fullPage: false });
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
