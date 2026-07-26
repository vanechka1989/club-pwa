import { expect, test, type Page, type Route } from "@playwright/test";

const now = "2026-07-26T09:00:00.000Z";

function user(active: boolean) {
  return {
    id: "customer-audit",
    telegramId: "audit-1001",
    email: "customer.audit@example.com",
    displayName: "Тестовый клиент",
    firstName: "Тестовый клиент",
    username: null,
    photoUrl: null,
    role: "member",
    realRole: "member",
    adminRoleLabel: null,
    adminPermissions: [],
    membershipStatus: active ? "active" : "inactive",
    membershipExpiresAt: active ? "2026-08-25T09:00:00.000Z" : null,
    paymentType: active ? "one_time" : "none",
    recurrentPaymentStatus: null,
    nextPaymentAt: null,
    avatarPositionX: 50,
    avatarPositionY: 50,
    avatarScale: 1,
    avatarRefreshedAt: null
  };
}

function json(body: unknown, status = 200) {
  return { status, contentType: "application/json", body: JSON.stringify(body) };
}

async function mockCustomerApi(page: Page) {
  let authenticated = false;
  let checkoutCreated = false;
  let paid = false;

  await page.addInitScript(() => {
    const originalMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query: string) => {
      if (query === "(display-mode: standalone)") {
        const matches = localStorage.getItem("audit-installed") === "1";
        return {
          matches,
          media: query,
          onchange: null,
          addEventListener() {},
          removeEventListener() {},
          addListener() {},
          removeListener() {},
          dispatchEvent() { return false; }
        } as MediaQueryList;
      }
      return originalMatchMedia(query);
    };
    Object.defineProperty(window, "open", {
      configurable: true,
      value: (url: string) => {
        (window as typeof window & { __auditCheckoutUrl?: string }).__auditCheckoutUrl = url;
        return { closed: false };
      }
    });
  });

  await page.route("**/api/**", async (route: Route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (!pathname.startsWith("/api/")) {
      await route.fallback();
      return;
    }
    const path = pathname.replace(/^\/api/, "");

    if (path === "/me") {
      await route.fulfill(authenticated ? json({ user: user(paid) }) : json({ error: "unauthorized" }, 401));
      return;
    }
    if (path === "/auth/email/start" && request.method() === "POST") {
      await route.fulfill(json({ ok: true, devCode: "123456" }));
      return;
    }
    if (path === "/auth/email/verify" && request.method() === "POST") {
      authenticated = true;
      await route.fulfill(json({ ok: true }));
      return;
    }
    if (path === "/me/device") {
      await route.fulfill(json({ ok: true, user: user(paid) }));
      return;
    }
    if (path === "/app-state") {
      const current = user(paid);
      await route.fulfill(json({
        access: {
          role: current.role,
          realRole: current.realRole,
          adminRoleLabel: null,
          adminPermissions: [],
          membershipStatus: current.membershipStatus,
          membershipExpiresAt: current.membershipExpiresAt,
          paymentType: current.paymentType,
          recurrentPaymentStatus: null,
          nextPaymentAt: null
        },
        notificationUnreadCount: 0,
        supportUnreadCount: 0
      }));
      return;
    }
    if (path === "/payments/plans") {
      await route.fulfill(json({
        plans: [],
        provider: null,
        products: [{
          id: "audit-product-30",
          providerId: "audit-provider",
          kind: "one_time",
          title: "Доступ на 30 дней",
          description: "Полный доступ к клубу",
          badgeLabel: "Популярный",
          amountRub: 500,
          accessDays: 30,
          prodamusSubscriptionId: null,
          bindings: [
            { provider: "prodamus", enabled: true, externalProductId: "audit-30", externalOfferId: null },
            { provider: "lava", enabled: true, externalProductId: "audit-lava-30", externalOfferId: null }
          ],
          isPublished: true,
          archivedUntil: null,
          createdAt: now,
          updatedAt: now
        }],
        recurrentSubscriptions: []
      }));
      return;
    }
    if (path === "/learning") {
      await route.fulfill(json({
        categories: [],
        featured: [],
        progress: {
          totalItems: 0,
          completedItems: 0,
          lastOpenedItem: null,
          lastOpenedMaterialId: null,
          lastOpenedAt: null,
          lastOpenedPlaybackPositionSeconds: 0
        }
      }));
      return;
    }
    if (path === "/payments/checkout" && request.method() === "POST") {
      const payload = request.postDataJSON() as { provider?: string };
      if (!payload.provider) {
        await route.fulfill(json({
          checkoutUrl: null,
          message: "Выберите способ оплаты",
          options: [
            { provider: "prodamus", title: "Prodamus" },
            { provider: "lava", title: "Lava" }
          ]
        }));
        return;
      }
      checkoutCreated = true;
      await route.fulfill(json({ checkoutUrl: "https://payments.example/audit-order", message: "Оплата создана" }));
      return;
    }
    if (path === "/payments/orders") {
      if (checkoutCreated) paid = true;
      await route.fulfill(json({
        orders: checkoutCreated ? [{ id: "audit-order", status: "paid", createdAt: new Date().toISOString() }] : []
      }));
      return;
    }
    if (path === "/notifications") {
      await route.fulfill(json({ notifications: [], unreadCount: 0 }));
      return;
    }
    if (path === "/support/unread") {
      await route.fulfill(json({ unreadCount: 0 }));
      return;
    }
    if (path === "/me/referrals") {
      await route.fulfill(json({
        referral: { code: "audit", link: "https://club.example", invitedCount: 0, paidCount: 0, availableDays: 0, activatedDays: 0, canActivate: false, activationBlockedReason: "no_available_days" },
        settings: { referralRewardDays: 7 }
      }));
      return;
    }
    if (path === "/push/vapid-public-key") {
      await route.fulfill(json({ publicKey: null }));
      return;
    }

    await route.fulfill(json({ ok: true }));
  });
}

test("new customer installs, signs in, buys access, and returns active", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await mockCustomerApi(page);

  await page.goto("/");
  const continueOnDesktop = page.getByRole("button", { name: "Всё равно продолжить" });
  if (await continueOnDesktop.isVisible()) {
    await continueOnDesktop.click();
  }
  await expect(page.locator(".auth-install-required")).toBeVisible();
  await expect(page.locator(".auth-form")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("01-install.png"), fullPage: true });

  await page.evaluate(() => {
    localStorage.setItem("audit-installed", "1");
    window.dispatchEvent(new Event("appinstalled"));
  });
  await expect(page.getByRole("heading", { name: "Вход в клуб" })).toBeVisible();

  await page.getByLabel("Email").fill("customer.audit@example.com");
  await page.getByRole("button", { name: "Получить код" }).click();
  await expect(page.getByRole("heading", { name: "Код из письма" })).toBeVisible();
  await expect(page.getByText("Письмо не пришло? Проверьте папку «Спам».")) .toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("02-code.png"), fullPage: true });

  await page.getByRole("textbox", { name: "Код", exact: true }).fill("123456");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByRole("heading", { name: "Профиль" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Оплата" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Модули" })).toHaveCount(0);

  await page.getByRole("button", { name: "Оплата" }).click();
  await expect(page.getByText("Доступ на 30 дней", { exact: true })).toBeVisible();
  await expect(page.getByText("500 ₽ · Доступ на 30 дн.", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("03-tariff.png"), fullPage: true });

  await page.getByRole("button", { name: "Оплатить" }).click();
  await expect(page.getByRole("heading", { name: "Подтвердите оплату" })).toBeVisible();
  await expect(page.getByText("После оплаты зачисление обычно занимает от 5 до 15 минут. Вернитесь в приложение, доступ обновится автоматически.")).toBeVisible();
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page.getByRole("heading", { name: "Выберите способ оплаты" })).toBeVisible();
  await page.getByRole("button", { name: "Оплатить через Prodamus" }).click();

  await expect.poll(() => page.evaluate(() => (window as typeof window & { __auditCheckoutUrl?: string }).__auditCheckoutUrl)).toBe("https://payments.example/audit-order");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("club-payment-watch"))).not.toBeNull();

  await page.reload();
  await expect(page.getByText("Оплата прошла. Доступ открыт.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Модули" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Общение" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("club-payment-watch"))).toBeNull();
  await page.screenshot({ path: testInfo.outputPath("04-access-open.png"), fullPage: true });

  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  const unexpectedErrors = errors.filter((message) =>
    !message.includes("status of 401 (Unauthorized)") &&
    !message.includes('Viewport argument key "interactive-widget" not recognized and ignored.')
  );
  expect(unexpectedErrors).toEqual([]);
});
