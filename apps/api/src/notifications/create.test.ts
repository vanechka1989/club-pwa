import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  returning: vi.fn(),
  transaction: vi.fn(),
  sendWebPushToUser: vi.fn(),
  warn: vi.fn()
}));

vi.mock("../db/client", () => ({
  db: {
    transaction: mocks.transaction,
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
    mocks.transaction.mockImplementation(async (work) => work({
      execute: vi.fn(),
      query: { appNotifications: { findFirst: vi.fn(async () => null) } },
      insert: () => ({ values: () => ({ returning: mocks.returning }) })
    }));
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

  it("deduplicates a message notification by recipient, source, and source id before push", async () => {
    const existing = { id: "existing-notification" };
    const execute = vi.fn();
    const findFirst = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing);
    mocks.transaction.mockImplementation(async (work) => work({
      execute,
      query: { appNotifications: { findFirst } },
      insert: () => ({ values: () => ({ returning: mocks.returning }) })
    }));
    mocks.sendWebPushToUser.mockResolvedValue(undefined);
    const input = {
      userId: "00000000-0000-4000-8000-000000000001",
      title: "Вас упомянули",
      body: "Анна: привет",
      source: "community_mention",
      sourceId: "00000000-0000-4000-8000-000000000100",
      deduplicate: true
    } as const;

    const first = await createAppNotification(input);
    const retry = await createAppNotification(input);

    expect(first).toEqual({ id: "notification-id" });
    expect(retry).toBe(existing);
    expect(mocks.returning).toHaveBeenCalledTimes(1);
    expect(mocks.sendWebPushToUser).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("does not persist or push a guarded notification for an inactive community message", async () => {
    const execute = vi.fn(async () => []);
    mocks.transaction.mockImplementation(async (work) => work({
      execute,
      query: { appNotifications: { findFirst: vi.fn(async () => null) } },
      insert: () => ({ values: () => ({ returning: mocks.returning }) })
    }));

    await expect(createAppNotification({
      userId: "00000000-0000-4000-8000-000000000001",
      title: "Вас упомянули",
      body: "Новое упоминание.",
      source: "community_mention",
      sourceId: "00000000-0000-4000-8000-000000000100",
      deduplicate: true
    }, {
      activeCommunityMessageId: "00000000-0000-4000-8000-000000000100"
    })).resolves.toBeNull();

    expect(execute).toHaveBeenCalledOnce();
    expect(mocks.returning).not.toHaveBeenCalled();
    expect(mocks.sendWebPushToUser).not.toHaveBeenCalled();
  });

  it("releases the guarded message transaction before starting network push delivery", async () => {
    let insideTransaction = false;
    let pushObservedInsideTransaction = false;
    const execute = vi.fn()
      .mockResolvedValueOnce([{ id: "00000000-0000-4000-8000-000000000100" }])
      .mockResolvedValueOnce([]);
    mocks.transaction.mockImplementation(async (work) => {
      insideTransaction = true;
      try {
        return await work({
          execute,
          query: { appNotifications: { findFirst: vi.fn(async () => null) } },
          insert: () => ({ values: () => ({ returning: mocks.returning }) })
        });
      } finally {
        insideTransaction = false;
      }
    });
    mocks.sendWebPushToUser.mockImplementation(async () => {
      pushObservedInsideTransaction = insideTransaction;
    });

    await createAppNotification({
      userId: "00000000-0000-4000-8000-000000000001",
      title: "Вас упомянули",
      body: "Новое упоминание.",
      source: "community_mention",
      sourceId: "00000000-0000-4000-8000-000000000100",
      deduplicate: true
    }, {
      activeCommunityMessageId: "00000000-0000-4000-8000-000000000100"
    });

    expect(pushObservedInsideTransaction).toBe(false);
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
