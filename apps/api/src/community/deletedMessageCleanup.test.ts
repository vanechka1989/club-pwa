import { describe, expect, it, vi } from "vitest";
import type { StoredS3Config } from "../storage/s3Config";

vi.mock("../db/client", () => ({ db: {} }));
vi.mock("../env", () => ({ env: {} }));
vi.mock("../logger", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));
import { createDeleteObjectCopies } from "../storage/s3";
import {
  createDeletedMessageCleanup,
  createDeletedMessageCleanupJob,
  createDeletedMessageCleanupRepository,
  deletedMessageCleanupBatchSize,
  type DeletedMessageCleanupRepository
} from "./deletedMessageCleanup";

const candidate = {
  id: "message-1",
  claimId: "00000000-0000-4000-8000-000000000300",
  attachments: [
    { id: "attachment-1", objectKey: "community/images/message-1/a.webp" },
    { id: "attachment-2", objectKey: "community/images/message-1/b.webp" }
  ]
};

describe("deleted message cleanup", () => {
  it("erases primary and reserve copies for an attachment already marked deleted before finalizing", async () => {
    const legacyDeletedAttachment = {
      id: "attachment-legacy",
      messageId: candidate.id,
      objectKey: "community/images/message-1/legacy.webp",
      deletedAt: new Date("2026-07-29T09:00:00.000Z")
    };
    const claimedRows = [{ id: candidate.id, claimId: candidate.claimId }];
    const database = {
      execute: vi.fn(async () => claimedRows),
      query: {
        clubMessageAttachments: {
          findMany: vi.fn(async () => [legacyDeletedAttachment])
        }
      }
    };
    const claimed = await createDeletedMessageCleanupRepository(database as never).claimBatch({ limit: 100 });
    const calls: string[] = [];
    const primary: StoredS3Config = {
      endpoint: "https://primary.example.com",
      region: "ru1",
      bucket: "primary",
      accessKeyId: "primary-access",
      secretAccessKey: "primary-secret",
      publicBaseUrl: null,
      signedUrlTtlSeconds: 600,
      reserve: {
        endpoint: "https://reserve.example.com",
        region: "ru2",
        bucket: "reserve",
        accessKeyId: "reserve-access",
        secretAccessKey: "reserve-secret",
        publicBaseUrl: null
      }
    };
    const removeCopies = createDeleteObjectCopies({
      loadConfig: async () => primary,
      deleteFromConfig: async (config, key) => {
        calls.push(`${config.bucket}:${key}`);
      }
    });
    const repository: DeletedMessageCleanupRepository = {
      claimBatch: vi.fn(async () => claimed),
      finalize: vi.fn(async () => {
        calls.push("finalize");
        return true;
      }),
      release: vi.fn(async () => undefined)
    };
    const cleanup = createDeletedMessageCleanup({
      repository,
      deleteObjectCopies: removeCopies,
      logger: { info: vi.fn(), warn: vi.fn() }
    });

    await expect(cleanup()).resolves.toEqual({ purgedMessageIds: [candidate.id], failedMessageIds: [] });

    expect(calls).toEqual([
      "primary:community/images/message-1/legacy.webp",
      "reserve:community/images/message-1/legacy.webp",
      "finalize"
    ]);
  });

  it("performs remote deletion outside database work and finalizes the bounded claim", async () => {
    let databaseWork = false;
    const calls: string[] = [];
    const repository: DeletedMessageCleanupRepository = {
      claimBatch: vi.fn(async ({ limit }) => {
        expect(limit).toBe(deletedMessageCleanupBatchSize);
        databaseWork = true;
        calls.push("claim");
        databaseWork = false;
        return [candidate];
      }),
      finalize: vi.fn(async (claimed) => {
        databaseWork = true;
        calls.push(`finalize:${claimed.id}:${claimed.claimId}`);
        databaseWork = false;
        return true;
      }),
      release: vi.fn(async () => undefined)
    };
    const deleteObjectCopies = vi.fn(async (key: string) => {
      expect(databaseWork).toBe(false);
      calls.push(`s3:${key}`);
    });
    const info = vi.fn();
    const cleanup = createDeletedMessageCleanup({
      repository,
      deleteObjectCopies,
      logger: { info, warn: vi.fn() }
    });

    const result = await cleanup();

    expect(result).toEqual({ purgedMessageIds: [candidate.id], failedMessageIds: [] });
    expect(calls).toEqual([
      "claim",
      "s3:community/images/message-1/a.webp",
      "s3:community/images/message-1/b.webp",
      `finalize:${candidate.id}:${candidate.claimId}`
    ]);
    expect(repository.release).not.toHaveBeenCalled();
  });

  it("releases a partial storage failure and can finalize the same claim on retry", async () => {
    let cleanupAttempt = 0;
    const repository: DeletedMessageCleanupRepository = {
      claimBatch: vi.fn(async () => [candidate]),
      finalize: vi.fn(async () => true),
      release: vi.fn(async () => undefined)
    };
    const deleteObjectCopies = vi.fn(async (key: string) => {
      if (cleanupAttempt === 0 && key.endsWith("b.webp")) throw new Error("reserve unavailable");
    });
    const cleanup = createDeletedMessageCleanup({
      repository,
      deleteObjectCopies,
      logger: { info: vi.fn(), warn: vi.fn() }
    });

    await expect(cleanup()).resolves.toEqual({ purgedMessageIds: [], failedMessageIds: [candidate.id] });
    expect(repository.release).toHaveBeenCalledWith(candidate);
    expect(repository.finalize).not.toHaveBeenCalled();

    cleanupAttempt += 1;
    await expect(cleanup()).resolves.toEqual({ purgedMessageIds: [candidate.id], failedMessageIds: [] });
    expect(repository.finalize).toHaveBeenCalledWith(candidate);
  });
});

describe("deleted message cleanup scheduler", () => {
  it("prevents overlapping ticks and waits for an active run during shutdown", async () => {
    let finish!: () => void;
    const cleanup = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    let tick!: () => void;
    const clearInterval = vi.fn();
    const job = createDeletedMessageCleanupJob({
      cleanup,
      setInterval: (run) => {
        tick = run;
        return "timer" as never;
      },
      clearInterval,
      logger: { warn: vi.fn() }
    });
    await Promise.resolve();

    tick();
    tick();
    expect(cleanup).toHaveBeenCalledOnce();

    let stopped = false;
    const stopping = job.stop().then(() => { stopped = true; });
    await Promise.resolve();
    expect(clearInterval).toHaveBeenCalledWith("timer");
    expect(stopped).toBe(false);

    finish();
    await stopping;
    expect(stopped).toBe(true);
  });
});
