import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearCommunityOutboxForUser,
  configureCommunityOutbox,
  createDeliveryKey,
  flushQueuedMessages,
  getQueuedTextMessages,
  mergeConfirmedCommunityMessages,
  queueTextMessage,
  reconcileQueuedMessages,
  removeQueuedMessage,
  resetCommunityOutbox,
  retryQueuedMessage
} from "./communityOutbox";

const baseInput = {
  topicId: "topic-1",
  body: "Сообщение",
  replyToMessageId: null,
  localId: "local-1"
};

describe("community text outbox", () => {
  beforeEach(() => {
    localStorage.clear();
    resetCommunityOutbox();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses a stable device and local operation id as the delivery key", () => {
    expect(createDeliveryKey("device-1", "local-1")).toBe("device-1:local-1");
  });

  it("persists an offline message and restores it after reload in the same scope", async () => {
    configureCommunityOutbox({
      userId: "user-1",
      deviceId: "device-1",
      storage: localStorage,
      isOnline: () => false,
      send: vi.fn()
    });

    await queueTextMessage(baseInput);
    resetCommunityOutbox();
    configureCommunityOutbox({
      userId: "user-1",
      deviceId: "device-1",
      storage: localStorage,
      isOnline: () => false,
      send: vi.fn()
    });

    expect(getQueuedTextMessages("topic-1")).toMatchObject([
      {
        localId: "local-1",
        deliveryKey: "device-1:local-1",
        topicId: "topic-1",
        body: "Сообщение",
        status: "queued"
      }
    ]);
  });

  it("retries an ambiguous failure with the exact same delivery key", async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error("connection_lost"))
      .mockResolvedValueOnce({ message: { id: "server-1", clientOperationId: "device-1:local-1" } });
    configureCommunityOutbox({
      userId: "user-1",
      deviceId: "device-1",
      storage: localStorage,
      send,
      isOnline: () => true
    });

    const first = await queueTextMessage(baseInput);
    const second = await retryQueuedMessage("local-1");

    expect(first.delivered).toBe(false);
    expect(second.delivered).toBe(true);
    expect(send).toHaveBeenNthCalledWith(1, {
      topicId: "topic-1",
      body: "Сообщение",
      mentions: [],
      replyToMessageId: null,
      clientOperationId: "device-1:local-1"
    });
    expect(send).toHaveBeenNthCalledWith(2, expect.objectContaining({ clientOperationId: "device-1:local-1" }));
    expect(getQueuedTextMessages()).toEqual([]);
  });

  it("persists selected mention identities and reuses them on every retry", async () => {
    const mentions = [{
      userId: "00000000-0000-4000-8000-000000000002",
      displayName: "Анна",
      start: 0,
      end: 5
    }];
    const send = vi.fn()
      .mockRejectedValueOnce(new Error("connection_lost"))
      .mockResolvedValueOnce({ message: { id: "server-mention", clientOperationId: "device-1:mention" } });
    configureCommunityOutbox({
      userId: "user-1",
      deviceId: "device-1",
      storage: localStorage,
      send,
      isOnline: () => true
    });

    await queueTextMessage({
      topicId: "topic-1",
      localId: "mention",
      body: "@Анна привет",
      mentions
    });
    expect(getQueuedTextMessages()).toMatchObject([{ mentions }]);
    await retryQueuedMessage("mention");

    expect(send).toHaveBeenNthCalledWith(1, expect.objectContaining({
      clientOperationId: "device-1:mention",
      mentions
    }));
    expect(send).toHaveBeenNthCalledWith(2, expect.objectContaining({
      clientOperationId: "device-1:mention",
      mentions
    }));
  });

  it("normalizes duplicate participant identities before persistence and delivery", async () => {
    const first = { userId: "00000000-0000-4000-8000-000000000002", displayName: "Анна", start: 0, end: 5 };
    const duplicate = { ...first, start: 8, end: 13 };
    const send = vi.fn().mockRejectedValue(new Error("offline"));
    configureCommunityOutbox({
      userId: "user-1",
      deviceId: "device-1",
      storage: localStorage,
      send,
      isOnline: () => true
    });

    await queueTextMessage({
      topicId: "topic-1",
      localId: "duplicate-mention",
      body: "@Анна и @Анна",
      mentions: [first, duplicate]
    });

    expect(getQueuedTextMessages()).toMatchObject([{ mentions: [first] }]);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ mentions: [first] }));
  });

  it("does not retain a terminal authorization failure for automatic retry", async () => {
    const failure = { status: 403, data: { mutedPermanently: true } };
    configureCommunityOutbox({
      userId: "user-1",
      deviceId: "device-1",
      storage: localStorage,
      send: vi.fn().mockRejectedValue(failure),
      isOnline: () => true
    });

    const result = await queueTextMessage(baseInput);

    expect(result).toMatchObject({ delivered: false, retryable: false, error: failure });
    expect(getQueuedTextMessages()).toEqual([]);
  });

  it("rejects oversized text without truncating or persisting user content", async () => {
    const send = vi.fn();
    configureCommunityOutbox({
      userId: "user-1",
      deviceId: "device-1",
      storage: localStorage,
      send,
      isOnline: () => true
    });

    await expect(queueTextMessage({ ...baseInput, body: "я".repeat(3001) }))
      .rejects.toThrow("invalid_community_text_message");
    expect(send).not.toHaveBeenCalled();
    expect(getQueuedTextMessages()).toEqual([]);
  });

  it("shares one in-flight retry and does not issue duplicate concurrent sends", async () => {
    let resolveSend!: (value: { message: { id: string; clientOperationId: string } }) => void;
    const send = vi.fn((_input: { body: string }) => new Promise<{ message: { id: string; clientOperationId: string } }>((resolve) => {
      resolveSend = resolve;
    }));
    configureCommunityOutbox({
      userId: "user-1",
      deviceId: "device-1",
      storage: localStorage,
      send,
      isOnline: () => false
    });
    await queueTextMessage(baseInput);
    configureCommunityOutbox({
      userId: "user-1",
      deviceId: "device-1",
      storage: localStorage,
      send,
      isOnline: () => true
    });

    const first = retryQueuedMessage("local-1");
    const duplicate = retryQueuedMessage("local-1");
    expect(send).toHaveBeenCalledTimes(1);
    resolveSend({ message: { id: "server-1", clientOperationId: "device-1:local-1" } });

    await expect(Promise.all([first, duplicate])).resolves.toMatchObject([
      { delivered: true },
      { delivered: true }
    ]);
  });

  it("does not publish an old account confirmation after the active account switches", async () => {
    let resolveSend!: (value: { message: { id: string; clientOperationId: string } }) => void;
    const onConfirmed = vi.fn();
    configureCommunityOutbox({
      userId: "user-1",
      deviceId: "device-1",
      storage: localStorage,
      send: () => new Promise<{ message: { id: string; clientOperationId: string } }>((resolve) => {
        resolveSend = resolve;
      }),
      isOnline: () => true,
      onConfirmed
    });
    const oldDelivery = queueTextMessage(baseInput);

    configureCommunityOutbox({
      userId: "user-2",
      deviceId: "device-1",
      storage: localStorage,
      send: vi.fn(),
      isOnline: () => false
    });
    resolveSend({ message: { id: "server-1", clientOperationId: "device-1:local-1" } });
    await oldDelivery;

    expect(onConfirmed).not.toHaveBeenCalled();
  });

  it("reconciles a realtime confirmation with its optimistic entry and deduplicates responses", async () => {
    configureCommunityOutbox({
      userId: "user-1",
      deviceId: "device-1",
      storage: localStorage,
      isOnline: () => false,
      send: vi.fn()
    });
    await queueTextMessage(baseInput);
    const confirmation = { id: "server-1", clientOperationId: "device-1:local-1", body: "Сообщение" };

    const reconciled = reconcileQueuedMessages([confirmation, { ...confirmation }]);
    const merged = mergeConfirmedCommunityMessages(
      [{ id: "local:local-1", clientOperationId: "device-1:local-1", body: "Сообщение" }],
      reconciled
    );

    expect(getQueuedTextMessages()).toEqual([]);
    expect(merged).toEqual([confirmation]);
  });

  it("isolates account and device queues, clears logout state, and stores text fields only", async () => {
    configureCommunityOutbox({
      userId: "user-1",
      deviceId: "device-1",
      storage: localStorage,
      isOnline: () => false,
      send: vi.fn()
    });
    await queueTextMessage({
      ...baseInput,
      uploadUrl: "https://storage.example/signed?secret=token",
      mediaBytes: new Uint8Array([1, 2, 3])
    } as typeof baseInput);

    const persisted = localStorage.getItem("club-community-text-outbox-v1") ?? "";
    expect(persisted).not.toContain("storage.example");
    expect(persisted).not.toContain("mediaBytes");

    configureCommunityOutbox({
      userId: "user-2",
      deviceId: "device-1",
      storage: localStorage,
      isOnline: () => false,
      send: vi.fn()
    });
    expect(getQueuedTextMessages()).toEqual([]);
    configureCommunityOutbox({
      userId: "user-1",
      deviceId: "device-2",
      storage: localStorage,
      isOnline: () => false,
      send: vi.fn()
    });
    expect(getQueuedTextMessages()).toEqual([]);

    clearCommunityOutboxForUser("user-1", localStorage);
    configureCommunityOutbox({
      userId: "user-1",
      deviceId: "device-1",
      storage: localStorage,
      isOnline: () => false,
      send: vi.fn()
    });
    expect(getQueuedTextMessages()).toEqual([]);
  });

  it("bounds persisted messages to the newest 100 and supports explicit removal", async () => {
    let now = 0;
    configureCommunityOutbox({
      userId: "user-1",
      deviceId: "device-1",
      storage: localStorage,
      isOnline: () => false,
      send: vi.fn(),
      now: () => ++now
    });

    for (let index = 0; index < 101; index += 1) {
      await queueTextMessage({ ...baseInput, localId: `local-${index}`, body: `message-${index}` });
    }

    expect(getQueuedTextMessages()).toHaveLength(100);
    expect(getQueuedTextMessages().some((entry) => entry.localId === "local-0")).toBe(false);
    removeQueuedMessage("local-100");
    expect(getQueuedTextMessages().some((entry) => entry.localId === "local-100")).toBe(false);
  });

  it("keeps the newly queued message when many entries share one timestamp", async () => {
    configureCommunityOutbox({
      userId: "user-1",
      deviceId: "device-1",
      storage: localStorage,
      isOnline: () => false,
      send: vi.fn(),
      now: () => 1
    });

    for (let index = 0; index < 101; index += 1) {
      await queueTextMessage({ ...baseInput, localId: `same-time-${index}` });
    }

    expect(getQueuedTextMessages().some((entry) => entry.localId === "same-time-100")).toBe(true);
    expect(getQueuedTextMessages()).toHaveLength(100);
  });

  it("discards corrupt storage rather than leaking malformed entries", () => {
    localStorage.setItem("club-community-text-outbox-v1", JSON.stringify([{ uploadUrl: "https://secret.example" }]));
    configureCommunityOutbox({
      userId: "user-1",
      deviceId: "device-1",
      storage: localStorage,
      isOnline: () => false,
      send: vi.fn()
    });

    expect(getQueuedTextMessages()).toEqual([]);
    expect(localStorage.getItem("club-community-text-outbox-v1")).toBeNull();
  });

  it("keeps FIFO order within a topic even when flush is triggered twice", async () => {
    const resolvers: Array<(value: { message: { id: string; clientOperationId: string } }) => void> = [];
    const send = vi.fn((_input: { body: string }) => new Promise<{ message: { id: string; clientOperationId: string } }>((resolve) => {
      resolvers.push(resolve);
    }));
    configureCommunityOutbox({
      userId: "user-1",
      deviceId: "device-1",
      storage: localStorage,
      isOnline: () => false,
      send
    });
    await queueTextMessage({ ...baseInput, localId: "first", body: "Первое" });
    await queueTextMessage({ ...baseInput, localId: "second", body: "Второе" });
    configureCommunityOutbox({
      userId: "user-1",
      deviceId: "device-1",
      storage: localStorage,
      isOnline: () => true,
      send
    });

    const firstFlush = flushQueuedMessages();
    const duplicateFlush = flushQueuedMessages();
    expect(duplicateFlush).toBe(firstFlush);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send.mock.calls[0]?.[0]).toMatchObject({ body: "Первое" });

    resolvers[0]!({ message: { id: "server-first", clientOperationId: "device-1:first" } });
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls[1]?.[0]).toMatchObject({ body: "Второе" });
    resolvers[1]!({ message: { id: "server-second", clientOperationId: "device-1:second" } });
    await firstFlush;
  });

  it("retries retryable failures after capped backoff without another online event", async () => {
    vi.useFakeTimers();
    const send = vi.fn()
      .mockRejectedValueOnce(new Error("gateway_unavailable"))
      .mockResolvedValueOnce({ message: { id: "server-1", clientOperationId: "device-1:local-1" } });
    configureCommunityOutbox({
      userId: "user-1",
      deviceId: "device-1",
      storage: localStorage,
      isOnline: () => true,
      retryBaseMs: 100,
      retryJitter: () => 0,
      send
    });

    const first = await queueTextMessage(baseInput);
    expect(first.retryable).toBe(true);
    await vi.advanceTimersByTimeAsync(99);
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(getQueuedTextMessages()).toEqual([]);
    vi.useRealTimers();
  });

  it("caps retry delay after jitter is applied", async () => {
    vi.useFakeTimers();
    const send = vi.fn()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce({ message: { id: "server-1", clientOperationId: "device-1:local-1" } });
    configureCommunityOutbox({
      userId: "user-1",
      deviceId: "device-1",
      storage: localStorage,
      isOnline: () => true,
      retryBaseMs: 100,
      retryMaximumMs: 150,
      retryJitter: () => 1,
      send
    });

    await queueTextMessage(baseInput);
    await vi.advanceTimersByTimeAsync(149);
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("does not send a later same-topic message while the FIFO head is waiting for retry", async () => {
    vi.useFakeTimers();
    const send = vi.fn()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce({ message: { id: "server-first", clientOperationId: "device-1:first" } })
      .mockResolvedValueOnce({ message: { id: "server-second", clientOperationId: "device-1:second" } });
    configureCommunityOutbox({
      userId: "user-1",
      deviceId: "device-1",
      storage: localStorage,
      isOnline: () => false,
      retryBaseMs: 100,
      retryJitter: () => 0,
      send
    });
    await queueTextMessage({ ...baseInput, localId: "first", body: "Первое" });
    await queueTextMessage({ ...baseInput, localId: "second", body: "Второе" });
    configureCommunityOutbox({
      userId: "user-1",
      deviceId: "device-1",
      storage: localStorage,
      isOnline: () => true,
      retryBaseMs: 100,
      retryJitter: () => 0,
      send
    });

    await flushQueuedMessages();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toMatchObject({ body: "Первое" });
    await vi.advanceTimersByTimeAsync(99);
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(3));
    expect(send.mock.calls[1]?.[0]).toMatchObject({ body: "Первое" });
    expect(send.mock.calls[2]?.[0]).toMatchObject({ body: "Второе" });
  });

  it("schedules a migrated failed backlog from each topic FIFO head", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    localStorage.setItem("club-community-text-outbox-v1", JSON.stringify([
      {
        userId: "user-1",
        deviceId: "device-1",
        topicId: "topic-1",
        localId: "first",
        deliveryKey: "device-1:first",
        body: "Первое",
        replyToMessageId: null,
        createdAt: 1,
        sequence: 1,
        status: "failed",
        attempts: 1,
        nextAttemptAt: 100
      },
      {
        userId: "user-1",
        deviceId: "device-1",
        topicId: "topic-1",
        localId: "second",
        deliveryKey: "device-1:second",
        body: "Второе",
        replyToMessageId: null,
        createdAt: 2,
        sequence: 2,
        status: "failed",
        attempts: 1,
        nextAttemptAt: 0
      }
    ]));
    const send = vi.fn(({ body, clientOperationId }: { body: string; clientOperationId: string }) =>
      Promise.resolve({ message: { id: `server-${body}`, clientOperationId } })
    );

    configureCommunityOutbox({
      userId: "user-1",
      deviceId: "device-1",
      storage: localStorage,
      isOnline: () => true,
      retryJitter: () => 0,
      send
    });

    await vi.advanceTimersByTimeAsync(99);
    expect(send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));

    expect(send.mock.calls.map(([input]) => input.body)).toEqual(["Первое", "Второе"]);
    expect(getQueuedTextMessages()).toEqual([]);
  });

  it("limits cross-topic delivery concurrency while allowing different topics to progress", async () => {
    const resolvers: Array<(value: { message: { id: string; clientOperationId: string } }) => void> = [];
    let active = 0;
    let peak = 0;
    const send = vi.fn(() => new Promise<{ message: { id: string; clientOperationId: string } }>((resolve) => {
      active += 1;
      peak = Math.max(peak, active);
      resolvers.push((value) => {
        active -= 1;
        resolve(value);
      });
    }));
    configureCommunityOutbox({
      userId: "user-1",
      deviceId: "device-1",
      storage: localStorage,
      isOnline: () => false,
      send
    });
    for (let index = 0; index < 5; index += 1) {
      await queueTextMessage({ ...baseInput, topicId: `topic-${index}`, localId: `local-${index}` });
    }
    configureCommunityOutbox({
      userId: "user-1",
      deviceId: "device-1",
      storage: localStorage,
      isOnline: () => true,
      send
    });

    const flush = flushQueuedMessages();
    expect(send).toHaveBeenCalledTimes(3);
    expect(peak).toBe(3);
    for (let index = 0; index < 5; index += 1) {
      await vi.waitFor(() => expect(resolvers[index]).toBeTypeOf("function"));
      resolvers[index]!({ message: { id: `server-${index}`, clientOperationId: `device-1:local-${index}` } });
      await Promise.resolve();
      await Promise.resolve();
    }
    await flush;
    expect(peak).toBe(3);
  });

  it("caps and persists each namespace independently and normalizes a preseeded backlog", async () => {
    const entry = (userId: string, index: number) => ({
      userId,
      deviceId: "device-1",
      topicId: "topic-1",
      localId: `${userId}-${index}`,
      deliveryKey: `device-1:${userId}-${index}`,
      body: `message-${index}`,
      replyToMessageId: null,
      createdAt: index,
      status: "queued",
      attempts: 0
    });
    localStorage.setItem("club-community-text-outbox-v1", JSON.stringify([
      ...Array.from({ length: 101 }, (_, index) => entry("user-1", index)),
      ...Array.from({ length: 100 }, (_, index) => entry("user-2", index))
    ]));
    configureCommunityOutbox({
      userId: "user-1",
      deviceId: "device-1",
      storage: localStorage,
      isOnline: () => false,
      send: vi.fn()
    });

    expect(getQueuedTextMessages()).toHaveLength(100);
    expect(getQueuedTextMessages().some((item) => item.localId === "user-1-0")).toBe(false);
    const all = JSON.parse(localStorage.getItem("club-community-text-outbox-v1") ?? "[]") as Array<{ userId: string }>;
    expect(all.filter((item) => item.userId === "user-2")).toHaveLength(100);
    expect(all).toHaveLength(200);
  });

  it("drops an oversized persisted body without discarding other valid queued text", () => {
    const entry = (localId: string, body: string) => ({
      userId: "user-1",
      deviceId: "device-1",
      topicId: "topic-1",
      localId,
      deliveryKey: `device-1:${localId}`,
      body,
      replyToMessageId: null,
      createdAt: 1,
      status: "queued",
      attempts: 0
    });
    localStorage.setItem("club-community-text-outbox-v1", JSON.stringify([
      entry("valid", "Сохранить"),
      entry("oversized", "я".repeat(3_001))
    ]));
    configureCommunityOutbox({
      userId: "user-1",
      deviceId: "device-1",
      storage: localStorage,
      isOnline: () => false,
      send: vi.fn()
    });

    expect(getQueuedTextMessages()).toMatchObject([{ localId: "valid", body: "Сохранить" }]);
    expect(localStorage.getItem("club-community-text-outbox-v1")).not.toContain("oversized");
  });

  it("settles an old account worker backlog when account ownership is cancelled", async () => {
    const deviceId = "device-1";
    localStorage.setItem("club-community-text-outbox-v1", JSON.stringify(
      Array.from({ length: 10 }, (_, index) => ({
        userId: "user-1",
        deviceId,
        topicId: `topic-${index}`,
        localId: `local-${index}`,
        deliveryKey: `${deviceId}:local-${index}`,
        body: `message-${index}`,
        replyToMessageId: null,
        createdAt: index,
        status: "queued",
        attempts: 0
      }))
    ));
    const resolvers: Array<(value: { message: { id: string; clientOperationId: string } }) => void> = [];
    configureCommunityOutbox({
      userId: "user-1",
      deviceId,
      storage: localStorage,
      isOnline: () => true,
      send: () => new Promise<{ message: { id: string; clientOperationId: string } }>((resolve) => resolvers.push(resolve))
    });
    let settled = false;
    const oldFlush = flushQueuedMessages().finally(() => { settled = true; });
    await vi.waitFor(() => expect(resolvers).toHaveLength(3));

    configureCommunityOutbox({
      userId: "user-2",
      deviceId,
      storage: localStorage,
      isOnline: () => false,
      send: vi.fn()
    });
    resolvers.forEach((resolve, index) => resolve({
      message: { id: `server-${index}`, clientOperationId: `${deviceId}:local-${index}` }
    }));
    for (let index = 0; index < 10; index += 1) await Promise.resolve();

    expect(settled).toBe(true);
    await oldFlush;
  });
});
