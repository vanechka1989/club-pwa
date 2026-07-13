import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("public mailing unsubscribe route", () => {
  it("is mounted outside authenticated admin mailings and is idempotent", () => {
    const indexSource = readFileSync(resolve(__dirname, "../index.ts"), "utf8");
    const routeSource = readFileSync(resolve(__dirname, "../routes/mailingPreferences.ts"), "utf8");
    expect(indexSource).toContain('app.route("/mailings", mailingPreferencesRoute)');
    expect(routeSource).toContain('get("/unsubscribe"');
    expect(routeSource).toContain("verifyMailingUnsubscribeToken");
    expect(routeSource).toContain("marketingEmailOptOutAt");
    expect(routeSource).not.toContain("telegramAuth");
  });

  it("shows a safe confirmation on GET and only unsubscribes on POST", () => {
    const routeSource = readFileSync(resolve(__dirname, "../routes/mailingPreferences.ts"), "utf8");
    const getHandler = routeSource.match(/async function showUnsubscribeConfirmation[\s\S]*?(?=async function confirmMailingUnsubscribe)/)?.[0] ?? "";

    expect(routeSource).toContain('.get("/unsubscribe", showUnsubscribeConfirmation)');
    expect(routeSource).toContain('.post("/unsubscribe", confirmMailingUnsubscribe)');
    expect(routeSource).toContain('method="post"');
    expect(routeSource).toContain("Отписаться от рассылок");
    expect(routeSource).toContain("Коды входа продолжат приходить");
    expect(getHandler).not.toContain(".update(users)");
  });
});
