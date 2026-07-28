import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearCommunityOutboxForUser,
  configureCommunityOutbox,
  createDeliveryKey,
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
      replyToMessageId: null,
      clientOperationId: "device-1:local-1"
    });
    expect(send).toHaveBeenNthCalledWith(2, expect.objectContaining({ clientOperationId: "device-1:local-1" }));
    expect(getQueuedTextMessages()).toEqual([]);
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
    const send = vi.fn(() => new Promise<{ message: { id: string; clientOperationId: string } }>((resolve) => {
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
});
