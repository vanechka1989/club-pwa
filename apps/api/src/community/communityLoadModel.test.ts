import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("../db/client", () => ({ db: {} }));
vi.mock("../logger", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));
vi.mock("../storage/s3", () => ({ deleteObjectCopies: vi.fn() }));
vi.mock("./realtimeRedis", () => ({
  publishCommunityRealtimeEnvelope: vi.fn(),
  subscribeToCommunityRealtimeEnvelopes: vi.fn()
}));
import {
  createCommunityObjectDeletionCleanup,
  communityObjectDeletionBatchSize
} from "./objectDeletionLedger";
import { loadCommunityDocumentScannerCandidates } from "./documentScanner";
import {
  loadCommunityMediaProcessorCandidates,
  loadCommunityMediaSweepCandidates,
  processCommunityMediaManifest
} from "./mediaProcessor";
import { normalizeSearchLimit } from "./messageSearch";
import { publishCommunityChange } from "./realtime";
import { loadCommunityTopicAggregates } from "./topicAggregates";
import { loadCommunityUploadExpiryCandidates } from "./uploadSessions";

const apiRouteSource = readFileSync(resolve(__dirname, "../routes/community.ts"), "utf8");

function voiceDependencies(transcodeVoiceFile: () => Promise<void>) {
  return {
    withWorkspace: async <T>(work: (paths: { inputPath: string; outputPath: string }) => Promise<T>) =>
      work({ inputPath: "input.webm", outputPath: "output.m4a" }),
    downloadToFile: async () => undefined,
    normalizeImageFile: async () => ({ fileName: "photo.webp", contentType: "image/webp", sizeBytes: 1, width: 1, height: 1 }),
    probeDuration: async () => 2,
    transcodeVoiceFile,
    uploadFile: async () => ({ sizeBytes: 1 }),
    mirrorToReserve: async () => undefined,
    deleteCopies: async () => undefined,
    registerCandidate: async () => ({
      id: "00000000-0000-4000-8000-000000000001",
      publicationToken: "00000000-0000-4000-8000-000000000002",
      sourceType: "candidate" as const,
      sourceId: "00000000-0000-4000-8000-000000000003",
      objectKey: "community/candidates/load-model.m4a"
    }),
    publishCandidate: async <T>(_publication: unknown, work: (signal: AbortSignal) => Promise<T>) =>
      work(new AbortController().signal),
    cleanupCandidate: async () => undefined,
    complete: async () => undefined,
    fail: async () => undefined
  };
}

describe("bounded community load model", () => {
  it("passes bounded candidate counts to every background repository", async () => {
    expect(normalizeSearchLimit(10_000)).toBe(50);

    const observed: number[] = [];
    const list = async (limit: number) => { observed.push(limit); return []; };
    await loadCommunityUploadExpiryCandidates(10_000, list);
    await loadCommunityMediaProcessorCandidates(10_000, list);
    await loadCommunityMediaSweepCandidates(10_000, list);
    await loadCommunityDocumentScannerCandidates(10_000, list);

    expect(observed).toEqual([50, 4, 50, 25]);

    let claimedLimit = 0;
    const cleanup = createCommunityObjectDeletionCleanup({
      repository: {
        enqueueDue: async () => undefined,
        claimBatch: async ({ limit }) => { claimedLimit = limit; return []; },
        quiescePublishers: async () => true,
        finalize: async () => true,
        release: async () => undefined
      },
      deleteObjectCopies: async () => undefined,
      logger: { info: () => undefined, warn: () => undefined }
    });
    await cleanup();
    expect(claimedLimit).toBe(communityObjectDeletionBatchSize);
    expect(communityObjectDeletionBatchSize).toBeLessThanOrEqual(100);
  });

  it.each([1, 100])("loads aggregates for %i topics with three set-based repository calls", async (topicCount) => {
    const topicIds = Array.from({ length: topicCount }, (_, index) => `topic-${index}`);
    const counts = vi.fn(async (ids: string[]) => ids.map((topicId) => ({ topicId, value: 1 })));
    const replies = vi.fn(async (ids: string[], userId: string) =>
      ids.map((topicId) => ({ topicId, createdAt: new Date("2026-07-29T10:00:00.000Z"), userId }))
    );
    const states = vi.fn(async (_userId: string, ids: string[]) =>
      new Map(ids.map((topicId) => [topicId, { unreadCount: 2, notificationMode: "mentions" as const }]))
    );

    const result = await loadCommunityTopicAggregates(topicIds, "user-1", {
      loadMessageCounts: counts,
      loadLatestReplies: replies,
      loadTopicStates: states
    });

    expect(result.countsByTopic.size).toBe(topicCount);
    expect(result.repliesByTopic.size).toBe(topicCount);
    expect(result.topicStates.size).toBe(topicCount);
    expect(counts).toHaveBeenCalledOnce();
    expect(replies).toHaveBeenCalledOnce();
    expect(states).toHaveBeenCalledOnce();
    expect(counts).toHaveBeenCalledWith(topicIds);
    expect(replies).toHaveBeenCalledWith(topicIds, "user-1");
    expect(states).toHaveBeenCalledWith("user-1", topicIds);
  });

  it("publishes invalidation identifiers instead of message histories", () => {
    const event = publishCommunityChange("topic-1");
    expect(event).toMatchObject({ type: "community.changed", topicId: "topic-1" });
    expect(Object.keys(event).sort()).toEqual(["createdAt", "id", "topicId", "type"]);
    expect(JSON.stringify(event)).not.toContain("messages");
  });

  it("keeps direct-upload routes out of API multipart-body parsing", () => {
    const directUploadRoutes = apiRouteSource.match(/\.post\("\/uploads"[\s\S]*?\.get\("\/events"/)?.[0] ?? "";
    expect(directUploadRoutes).not.toContain("formData()");
  });

  it("never runs more than two voice transcodes concurrently", async () => {
    let active = 0;
    let maximumActive = 0;
    const runs = Array.from({ length: 6 }, (_, index) => processCommunityMediaManifest({
      id: `manifest-${index}`,
      userId: "11111111-1111-4111-8111-111111111111",
      uploadToken: `22222222-2222-4222-8222-${String(index).padStart(12, "0")}`,
      kind: "voice" as const,
      quarantineObjectKey: `community/quarantine/voice-${index}.webm`,
      fileName: `voice-${index}.webm`,
      contentType: "audio/webm",
      sizeBytes: 1,
      durationSeconds: 2
    }, voiceDependencies(async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 20));
      active -= 1;
    })));

    await expect(Promise.all(runs)).resolves.toEqual(Array(6).fill("ready"));
    expect(maximumActive).toBe(2);
  });
});
