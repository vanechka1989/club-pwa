import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const appSource = readFileSync(resolve(process.cwd(), "src/App.vue"), "utf8");
const supportSource = readFileSync(resolve(process.cwd(), "src/features/support/SupportSection.vue"), "utf8");

describe("background polling load", () => {
  it("uses one jittered app-state interval instead of three competing timers", () => {
    expect(appSource).toContain("const backgroundPollingIntervalMs = 30_000");
    expect(appSource).toContain("withPollingJitter(backgroundPollingIntervalMs)");
    expect(appSource).toContain("getAppState");
    expect(appSource).toContain("appStateRefreshPromise");
    expect(appSource).not.toContain("sessionRefreshTimer");
    expect(appSource).not.toContain("supportUnreadTimer");
    expect(appSource).not.toContain("appNotificationTimer");
  });

  it("does not run periodic requests while the page is hidden", () => {
    expect(appSource).toContain('if (document.visibilityState !== "visible")');
    expect(supportSource).toContain('if (document.visibilityState !== "visible" || supportBusy.value)');
  });

  it("refreshes an open support screen every fifteen seconds", () => {
    expect(supportSource).toContain("const supportRefreshIntervalMs = 15_000");
  });
});
