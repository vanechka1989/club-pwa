import { describe, expect, it, vi } from "vitest";
vi.mock("../db/client", () => ({ db: {} }));
vi.mock("../logger", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));
vi.mock("../storage/s3", () => ({ deleteObjectCopies: vi.fn() }));
import {
  createCommunityObjectDeletionCleanup,
  createCommunityObjectDeletionCleanupJob,
  communityObjectDeletionBatchSize,
  type CommunityObjectDeletionRepository
} from "./objectDeletionLedger";

const job = {
  id: "00000000-0000-4000-8000-000000000701",
  claimId: "00000000-0000-4000-8000-000000000702",
  sourceType: "message",
  sourceId: "00000000-0000-4000-8000-000000000703",
  action: "delete_message" as const,
  expectedLifecycleVersion: 2,
  objectKeys: [
    "community/quarantine/u/file.docx",
    "community/candidates/u/file.webp",
    "community/final/u/file.webp"
  ]
};

describe("durable community object deletion ledger", () => {
  it("deletes every recorded primary/reserve/versioned key outside the claim and finalizes conditionally", async () => {
    let databaseWork = false;
    const events: string[] = [];
    const repository: CommunityObjectDeletionRepository = {
      enqueueDue: vi.fn(async () => undefined),
      claimBatch: vi.fn(async ({ limit }) => {
        expect(limit).toBe(communityObjectDeletionBatchSize);
        databaseWork = true;
        events.push("claim");
        databaseWork = false;
        return [job];
      }),
      finalize: vi.fn(async (candidate) => {
        databaseWork = true;
        events.push(`finalize:${candidate.claimId}`);
        databaseWork = false;
        return true;
      }),
      release: vi.fn(async () => undefined)
    };
    const cleanup = createCommunityObjectDeletionCleanup({
      repository,
      deleteObjectCopies: async (key) => {
        expect(databaseWork).toBe(false);
        events.push(`s3:${key}`);
      },
      logger: { info: vi.fn(), warn: vi.fn() }
    });

    await expect(cleanup()).resolves.toEqual({ completedJobIds: [job.id], failedJobIds: [] });
    expect(events).toEqual([
      "claim",
      ...job.objectKeys.map((key) => `s3:${key}`),
      `finalize:${job.claimId}`
    ]);
  });

  it("keeps the complete key ledger retryable after a partial reserve failure", async () => {
    let attempt = 0;
    const repository: CommunityObjectDeletionRepository = {
      enqueueDue: vi.fn(async () => undefined),
      claimBatch: vi.fn(async () => [job]),
      finalize: vi.fn(async () => true),
      release: vi.fn(async () => undefined)
    };
    const deleteObjectCopies = vi.fn(async (key: string) => {
      if (attempt === 0 && key.includes("candidates")) throw new Error("reserve unavailable");
    });
    const cleanup = createCommunityObjectDeletionCleanup({
      repository,
      deleteObjectCopies,
      logger: { info: vi.fn(), warn: vi.fn() }
    });

    await expect(cleanup()).resolves.toEqual({ completedJobIds: [], failedJobIds: [job.id] });
    expect(repository.release).toHaveBeenCalledWith(job, expect.stringContaining("reserve unavailable"));
    expect(repository.finalize).not.toHaveBeenCalled();

    attempt += 1;
    await expect(cleanup()).resolves.toEqual({ completedJobIds: [job.id], failedJobIds: [] });
    expect(deleteObjectCopies.mock.calls.filter(([key]) => key === job.objectKeys[0])).toHaveLength(2);
  });

  it("prevents overlap and awaits an active cleanup during shutdown", async () => {
    let finish!: () => void;
    const cleanup = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    let tick!: () => void;
    const clearInterval = vi.fn();
    const scheduler = createCommunityObjectDeletionCleanupJob({
      cleanup,
      setInterval: (run) => { tick = run; return "timer" as never; },
      clearInterval,
      logger: { warn: vi.fn() }
    });
    await Promise.resolve();

    tick();
    tick();
    expect(cleanup).toHaveBeenCalledOnce();
    let stopped = false;
    const stopping = scheduler.stop().then(() => { stopped = true; });
    await Promise.resolve();
    expect(stopped).toBe(false);
    finish();
    await stopping;
    expect(stopped).toBe(true);
  });
});
