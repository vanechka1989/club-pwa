import { describe, expect, it, vi } from "vitest";

vi.mock("../db/client", () => ({ db: {} }));
vi.mock("../storage/s3", () => ({ deleteObject: vi.fn() }));
vi.mock("../logger", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));
import {
  createDeletedMessageCleanup,
  deletedMessageCleanupBatchSize,
  type DeletedMessageCleanupRepository
} from "./deletedMessageCleanup";

describe("deleted message cleanup", () => {
  it("deletes retained objects before purging content in bounded idempotent batches", async () => {
    const calls: string[] = [];
    let transactionOpen = false;
    const purgeContent = vi.fn(async (messageId: string, attachmentIds: string[], purgedAt: Date) => {
      expect(transactionOpen).toBe(true);
      calls.push(`purge:${messageId}:${attachmentIds.join(",")}:${purgedAt.toISOString()}`);
    });
    const repository: DeletedMessageCleanupRepository = {
      runLockedBatch: async ({ limit, purge }) => {
        expect(limit).toBe(deletedMessageCleanupBatchSize);
        transactionOpen = true;
        const result = await purge([
          {
            id: "message-1",
            attachments: [
              { id: "attachment-1", objectKey: "community/images/message-1/a.webp" },
              { id: "attachment-2", objectKey: "community/images/message-1/b.webp" }
            ]
          }
        ], purgeContent);
        transactionOpen = false;
        return result;
      }
    };
    const deleteObject = vi.fn(async (key: string) => { calls.push(`s3:${key}`); });
    const info = vi.fn();
    const cleanup = createDeletedMessageCleanup({ repository, deleteObject, logger: { info, warn: vi.fn() } });

    const result = await cleanup(new Date("2026-08-29T00:00:00.000Z"));

    expect(result).toEqual({ purgedMessageIds: ["message-1"], failedMessageIds: [] });
    expect(calls).toEqual([
      "s3:community/images/message-1/a.webp",
      "s3:community/images/message-1/b.webp",
      "purge:message-1:attachment-1,attachment-2:2026-08-29T00:00:00.000Z"
    ]);
    expect(info).toHaveBeenCalledWith({ purgedMessageIds: ["message-1"], count: 1 }, "deleted community messages purged");
  });

  it("keeps database content when any object deletion fails and logs no original content", async () => {
    const secret = "original secret body";
    const repository: DeletedMessageCleanupRepository = {
      runLockedBatch: async ({ purge }) => purge([
        { id: "message-2", attachments: [{ id: "attachment-2", objectKey: "community/voice/message-2/a.webm" }] }
      ], vi.fn())
    };
    const error = new Error("storage unavailable");
    const warn = vi.fn();
    const cleanup = createDeletedMessageCleanup({
      repository,
      deleteObject: vi.fn(async () => { throw error; }),
      logger: { info: vi.fn(), warn }
    });

    const result = await cleanup();

    expect(result).toEqual({ purgedMessageIds: [], failedMessageIds: ["message-2"] });
    expect(JSON.stringify(warn.mock.calls)).not.toContain(secret);
    expect(warn).toHaveBeenCalledWith({ error, messageId: "message-2" }, "deleted community message purge failed");
  });
});
