import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendNotification: vi.fn(),
  setVapidDetails: vi.fn(),
  findMany: vi.fn(),
  warn: vi.fn()
}));

vi.mock("web-push", () => ({
  default: {
    sendNotification: mocks.sendNotification,
    setVapidDetails: mocks.setVapidDetails
  }
}));
vi.mock("../env", () => ({
  env: {
    WEB_PUSH_PUBLIC_KEY: "public-key",
    WEB_PUSH_PRIVATE_KEY: "private-key",
    WEB_PUSH_SUBJECT: "mailto:admin@example.com"
  }
}));
vi.mock("../db/client", () => ({
  db: {
    query: { pushSubscriptions: { findMany: mocks.findMany } },
    update: vi.fn()
  }
}));
vi.mock("../logger", () => ({ logger: { warn: mocks.warn } }));

import { sendWebPushToUser } from "./webPush";

describe("web push delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([{
      id: "00000000-0000-4000-8000-000000000010",
      userId: "00000000-0000-4000-8000-000000000001",
      endpoint: "https://push.example/subscription",
      p256dh: "p256dh-key",
      auth: "auth-key",
      userAgent: null,
      revokedAt: null,
      createdAt: new Date("2026-07-29T10:00:00.000Z"),
      updatedAt: new Date("2026-07-29T10:00:00.000Z")
    }]);
    mocks.sendNotification.mockResolvedValue({ statusCode: 201, body: "", headers: {} });
  });

  it("uses the web-push request timeout that aborts a stalled socket", async () => {
    await sendWebPushToUser("00000000-0000-4000-8000-000000000001", {
      title: "Новое сообщение",
      body: "Откройте чат.",
      url: "/community/topics/topic"
    });

    expect(mocks.sendNotification).toHaveBeenCalledWith(
      {
        endpoint: "https://push.example/subscription",
        keys: { p256dh: "p256dh-key", auth: "auth-key" }
      },
      JSON.stringify({
        title: "Новое сообщение",
        body: "Откройте чат.",
        url: "/community/topics/topic"
      }),
      { timeout: 10_000 }
    );
  });
});
