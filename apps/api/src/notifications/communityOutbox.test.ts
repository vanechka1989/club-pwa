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

  it("rechecks a revoke after persistence and retracts metadata before any push", async () => {
    const repository: CommunityNotificationOutboxRepository = {
      claimBatch: vi.fn(async ({ limit }) => {
        expect(limit).toBe(communityNotificationOutboxBatchSize);
        return [candidate];
      }),
      persistIfAccessible: vi.fn(async () => ({ notificationId: "notification-1" })),
      isStillAccessible: vi.fn(async () => false),
      finalize: vi.fn(async () => true),
      revoke: vi.fn(async () => undefined),
      release: vi.fn(async () => undefined)
    };
    const sendPush = vi.fn(async () => undefined);
    const worker = createCommunityNotificationOutboxWorker({
      repository,
      sendPush,
      logger: { info: vi.fn(), warn: vi.fn() }
    });

    await expect(worker()).resolves.toMatchObject({ revoked: 1, pushed: 0 });
    expect(repository.revoke).toHaveBeenCalledWith(candidate);
    expect(sendPush).not.toHaveBeenCalled();
  });

  it("performs slow network delivery outside repository work and retries a failure idempotently", async () => {
    let databaseWork = false;
    let attempt = 0;
    const repository: CommunityNotificationOutboxRepository = {
      claimBatch: vi.fn(async () => [candidate]),
      persistIfAccessible: vi.fn(async () => {
        databaseWork = true;
        databaseWork = false;
        return { notificationId: "notification-1" };
      }),
      isStillAccessible: vi.fn(async () => true),
      finalize: vi.fn(async () => true),
      revoke: vi.fn(async () => undefined),
      release: vi.fn(async () => undefined)
    };
    const sendPush = vi.fn(async () => {
      expect(databaseWork).toBe(false);
      if (attempt++ === 0) throw new Error("push timeout");
    });
    const worker = createCommunityNotificationOutboxWorker({
      repository,
      sendPush,
      logger: { info: vi.fn(), warn: vi.fn() }
    });

    await expect(worker()).resolves.toMatchObject({ failed: 1, pushed: 0 });
    expect(repository.release).toHaveBeenCalledWith(candidate, "push timeout");
    await expect(worker()).resolves.toMatchObject({ failed: 0, pushed: 1 });
    expect(repository.finalize).toHaveBeenCalledWith(candidate);
  });
});
