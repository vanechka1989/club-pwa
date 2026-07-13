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
});
