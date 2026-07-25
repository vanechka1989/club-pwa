import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  returning: vi.fn(),
  sendWebPushToUser: vi.fn(),
  warn: vi.fn()
}));

vi.mock("../db/client", () => ({
  db: {
    insert: () => ({
      values: () => ({
        returning: mocks.returning
      })
    })
  }
}));

vi.mock("../push/webPush", () => ({
  sendWebPushToUser: mocks.sendWebPushToUser
}));

vi.mock("../logger", () => ({
  logger: { warn: mocks.warn }
}));

import { createAppNotification } from "./create";

describe("createAppNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.returning.mockResolvedValue([{ id: "notification-id" }]);
  });

  it("waits for web push when a deployment requests reliable delivery", async () => {
    let finishPush!: () => void;
    mocks.sendWebPushToUser.mockReturnValue(new Promise<void>((resolve) => {
      finishPush = resolve;
    }));

    let completed = false;
    const creation = createAppNotification({
      userId: "owner-id",
      title: "Обновление установлено",
      body: "Новая версия готова."
    }, { waitForPush: true }).then(() => {
      completed = true;
    });

    await Promise.resolve();
    expect(completed).toBe(false);

    finishPush();
    await creation;
    expect(completed).toBe(true);
  });

  it("handles a background push failure without an unhandled rejection", async () => {
    const error = new Error("push failed");
    mocks.sendWebPushToUser.mockRejectedValue(error);

    await createAppNotification({
      userId: "owner-id",
      title: "Системное сообщение",
      body: "Текст."
    });
    await Promise.resolve();

    expect(mocks.warn).toHaveBeenCalledWith(
      { error, userId: "owner-id" },
      "app notification push failed"
    );
  });
});
