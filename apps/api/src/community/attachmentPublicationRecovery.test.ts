import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  communityAttachmentPublicationRecoveryBatchSize,
  communityAttachmentPublicationStaleMs,
  createCommunityAttachmentPublicationRecovery
} from "./attachmentPublicationRecovery";
import { communityObjectIoTimeoutMs } from "./objectLifecycle";

describe("legacy attachment publication recovery", () => {
  it("uses a bounded stale lease longer than the provider I/O deadline and atomically recovers a batch", async () => {
    const recoverBatch = vi.fn(async () => ([
      { messageId: "message-1", objectKeys: ["community/images/one.webp", "community/images/two.webp"] }
    ]));
    const info = vi.fn();
    const recover = createCommunityAttachmentPublicationRecovery({
      loadTargets: async () => ["primary", "reserve"],
      recoverBatch,
      logger: { info }
    });

    await expect(recover()).resolves.toEqual({
      recoveredMessageIds: ["message-1"],
      recoveredObjectKeys: ["community/images/one.webp", "community/images/two.webp"]
    });
    expect(communityAttachmentPublicationStaleMs).toBeGreaterThan(communityObjectIoTimeoutMs);
    expect(recoverBatch).toHaveBeenCalledWith({
      limit: communityAttachmentPublicationRecoveryBatchSize,
      staleMs: communityAttachmentPublicationStaleMs,
      targets: ["primary", "reserve"]
    });
    expect(info).toHaveBeenCalledWith(expect.objectContaining({ count: 1 }), "stale attachment publications fenced");
  });

  it("runs stale recovery before ordinary deletion and tombstone sweep work", () => {
    const source = readFileSync(new URL("./objectDeletionLedger.ts", import.meta.url), "utf8");
    const recovery = source.indexOf("await recoverStaleAttachmentPublications()");
    const sweep = source.indexOf("await runCommunityObjectTombstoneSweepBatch()");
    const cleanup = source.indexOf("return cleanupCommunityObjectDeletionJobs()");
    expect(recovery).toBeGreaterThan(0);
    expect(recovery).toBeLessThan(sweep);
    expect(sweep).toBeLessThan(cleanup);
  });
});
