import { describe, expect, it, vi } from "vitest";

vi.mock("../db/client", () => ({ db: {} }));
vi.mock("../storage/s3", () => ({ deleteObject: vi.fn(), deleteObjectCopies: vi.fn() }));
vi.mock("../logger", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));
import {
  createDeletedMessageCleanup,
  createDeletedMessageCleanupJob,
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
