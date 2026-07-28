import { beforeEach, describe, expect, it, vi } from "vitest";

const userId = "00000000-0000-4000-8000-000000000001";
const messageId = "00000000-0000-4000-8000-000000000100";
const secret = "Удалённый секретный текст";

const mocks = vi.hoisted(() => ({
  notifications: [] as Array<Record<string, unknown>>
}));

vi.mock("../db/client", () => ({
  db: {
    query: {
      appNotifications: { findMany: vi.fn(async () => mocks.notifications) }
    },
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => [{ value: mocks.notifications.length }])
      }))
    }))
  }
}));
vi.mock("../middleware/auth", () => ({
  telegramAuth: async (c: any, next: () => Promise<void>) => {
    c.set("userId", userId);
    await next();
  }
}));
vi.mock("../storage/s3", () => ({ getObjectReadUrl: vi.fn() }));
vi.mock("../mailings/notificationTracking", () => ({ recordUnreadMailingNotificationsOpened: vi.fn() }));

import { notificationsRoute } from "../routes/notifications";

describe("community notification deletion privacy", () => {
  beforeEach(() => {
    mocks.notifications = [{
      id: "00000000-0000-4000-8000-000000000200",
      userId,
      kind: "client",
      title: "Вас упомянули: Общение",
      body: `Вам ответили в чате \"Общение\".\nИван: ${secret}`,
      bodyHtml: null,
      source: "community_mention",
      sourceId: messageId,
      attachmentKind: null,
      attachmentFileName: null,
      attachmentObjectKey: null,
      attachmentContentType: null,
      attachmentSizeBytes: null,
      readAt: null,
      createdAt: new Date("2026-07-29T10:00:00.000Z")
    }];
  });

  it("never serializes a legacy community message preview from notification history", async () => {
    const response = await notificationsRoute.request("/");
    const payload = await response.json() as { notifications: Array<{ body: string }> };

    expect(response.status).toBe(200);
    expect(payload.notifications[0]?.body).toBe("Откройте чат, чтобы посмотреть упоминание.");
    expect(JSON.stringify(payload)).not.toContain(secret);
  });
});
