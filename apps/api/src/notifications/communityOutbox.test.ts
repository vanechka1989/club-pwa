import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
vi.mock("../db/client", () => ({ db: {} }));
vi.mock("../admin/roles", () => ({ getOwnerTelegramId: vi.fn(async () => "owner@example.test") }));
vi.mock("../push/webPush", () => ({ sendWebPushToUser: vi.fn() }));
vi.mock("../logger", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));
import {
  createCommunityNotificationOutboxWorker,
  enqueueCommunityNotificationsWithDependencies,
  communityNotificationOutboxBatchSize,
  storedCommunityNotificationAccessCondition,
  type CommunityNotificationOutboxRepository
} from "./communityOutbox";

const candidate = {
  id: "00000000-0000-4000-8000-000000000801",
  claimId: "00000000-0000-4000-8000-000000000802",
  userId: "00000000-0000-4000-8000-000000000803",
  topicId: "00000000-0000-4000-8000-000000000804",
  messageId: "00000000-0000-4000-8000-000000000805",
  accessVersion: 7,
  reason: "mention" as const,
  title: "Вас упомянули: Закрытая тема",
  body: "Новое упоминание.",
  pushUrl: "/community/topics/topic?message=message"
};

describe("access-versioned community notification outbox", () => {
  it("keeps ordinary source-less notifications visible", () => {
    const query = new PgDialect().sqlToQuery(
      storedCommunityNotificationAccessCondition("owner@example.test")
    ).sql;
    expect(query).toMatch(/"source" is null\s+or\s+"app_notifications"\."source" not in/i);
  });

  it("enqueues five hundred recipients with one bounded database statement and no push", async () => {
    const execute = vi.fn(async () => []);
    const mentionUserIds = Array.from({ length: 500 }, (_, index) =>
      `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);

    await enqueueCommunityNotificationsWithDependencies({
      messageId: candidate.messageId,
      topicId: candidate.topicId,
      topicTitle: "Тема",
      senderUserId: "00000000-0000-4000-8000-000000000999",
      senderName: "Автор",
      replyUserId: null,
      mentionUserIds
    }, { database: { execute } as never, ownerTelegramId: "owner@example.test" });

    expect(execute).toHaveBeenCalledOnce();
  });

  it("sends only privacy-safe generic push content after the durable access decision", async () => {
    const repository: CommunityNotificationOutboxRepository = {
      claimBatch: vi.fn(async () => [candidate]),
      sealForDelivery: vi.fn(async () => ({ status: "deliver" as const, notificationId: "notification-1" })),
      recordPushFailure: vi.fn(async () => undefined),
      release: vi.fn(async () => undefined)
    };
    const sendPush = vi.fn(async () => undefined);
    const worker = createCommunityNotificationOutboxWorker({
      repository,
      sendPush,
      logger: { info: vi.fn(), warn: vi.fn() }
    });

    await worker();

    expect(sendPush).toHaveBeenCalledWith(candidate.userId, {
      title: "Новое уведомление",
      body: "Откройте приложение, чтобы проверить обновления.",
      url: "/notifications"
    });
    expect(JSON.stringify(sendPush.mock.calls)).not.toContain(candidate.topicId);
    expect(JSON.stringify(sendPush.mock.calls)).not.toContain(candidate.messageId);
    expect(JSON.stringify(sendPush.mock.calls)).not.toContain("Закрытая тема");
  });

  it("suppresses revoked delivery durably before any push", async () => {
    const repository: CommunityNotificationOutboxRepository = {
      claimBatch: vi.fn(async ({ limit }) => {
        expect(limit).toBe(communityNotificationOutboxBatchSize);
        return [candidate];
      }),
      sealForDelivery: vi.fn(async () => ({ status: "suppressed" as const })),
      recordPushFailure: vi.fn(async () => undefined),
      release: vi.fn(async () => undefined)
    };
    const sendPush = vi.fn(async () => undefined);
    const worker = createCommunityNotificationOutboxWorker({
      repository,
      sendPush,
      logger: { info: vi.fn(), warn: vi.fn() }
    });

    await expect(worker()).resolves.toMatchObject({ revoked: 1, pushed: 0 });
    expect(repository.sealForDelivery).toHaveBeenCalledWith(candidate);
    expect(sendPush).not.toHaveBeenCalled();
  });

  it("seals delivery before network I/O and never retries a possibly delivered push", async () => {
    let databaseWork = false;
    let claimed = false;
    const events: string[] = [];
    const repository: CommunityNotificationOutboxRepository = {
      claimBatch: vi.fn(async () => claimed ? [] : (claimed = true, [candidate])),
      sealForDelivery: vi.fn(async () => {
        databaseWork = true;
        events.push("sealed");
        databaseWork = false;
        return { status: "deliver" as const, notificationId: "notification-1" };
      }),
      recordPushFailure: vi.fn(async () => { events.push("push-failure-recorded"); }),
      release: vi.fn(async () => undefined)
    };
    const sendPush = vi.fn(async () => {
      expect(databaseWork).toBe(false);
      events.push("push-attempted");
      throw new Error("push timeout");
    });
    const worker = createCommunityNotificationOutboxWorker({
      repository,
      sendPush,
      logger: { info: vi.fn(), warn: vi.fn() }
    });

    await expect(worker()).resolves.toMatchObject({ failed: 1, pushed: 0 });
    expect(repository.recordPushFailure).toHaveBeenCalledWith(candidate, "push timeout");
    expect(repository.release).not.toHaveBeenCalled();
    await expect(worker()).resolves.toMatchObject({ failed: 0, pushed: 0 });
    expect(sendPush).toHaveBeenCalledTimes(1);
    expect(events).toEqual(["sealed", "push-attempted", "push-failure-recorded"]);
  });
});
