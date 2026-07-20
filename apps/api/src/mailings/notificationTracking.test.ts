import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("mailing opens from the in-app notification center", () => {
  it("records unread mailing notifications before marking them read", () => {
    const helper = readFileSync(resolve(__dirname, "./notificationTracking.ts"), "utf8");
    const route = readFileSync(resolve(__dirname, "../routes/notifications.ts"), "utf8");

    expect(helper).toContain('eq(appNotifications.source, "mailing")');
    expect(helper).toContain('eq(adminMailingRecipients.channel, "push")');
    expect(helper).toContain('purpose: "open"');
    expect(route.match(/recordUnreadMailingNotificationsOpened/g)?.length).toBeGreaterThanOrEqual(2);
    expect(route.indexOf("recordUnreadMailingNotificationsOpened")).toBeLessThan(route.indexOf('.set({ readAt: new Date() })'));
  });
});
