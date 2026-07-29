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
import { createDeletedMessageCleanup, deletedMessageCleanupBatchSize } from "./deletedMessageCleanup";
import { processCommunityMediaManifest } from "./mediaProcessor";
import { normalizeSearchLimit } from "./messageSearch";
import { publishCommunityChange } from "./realtime";

const apiRouteSource = readFileSync(resolve(__dirname, "../routes/community.ts"), "utf8");
const uploadCleanupSource = readFileSync(resolve(__dirname, "uploadSessions.ts"), "utf8");
const mediaProcessorSource = readFileSync(resolve(__dirname, "mediaProcessor.ts"), "utf8");
const scannerSource = readFileSync(resolve(__dirname, "documentScanner.ts"), "utf8");
const browserUploadSource = readFileSync(resolve(__dirname, "../../../web/src/features/community/directUpload.ts"), "utf8");

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
    registerCandidate: async () => undefined,
    cleanupCandidate: async () => undefined,
    complete: async () => undefined,
    fail: async () => undefined
  };
}

describe("bounded community load model", () => {
  it("caps search, message, cleanup, and worker batches", async () => {
    expect(normalizeSearchLimit(10_000)).toBe(50);
    expect(apiRouteSource).toMatch(/messagePageQuerySchema[\s\S]*?\.max\(100\)\.default\(50\)/);
    expect(uploadCleanupSource).toContain("limit: Math.min(Math.max(1, limit), 50)");
    expect(mediaProcessorSource).toContain("limit: Math.min(Math.max(1, limit), 4)");
    expect(mediaProcessorSource).toContain("limit: Math.min(Math.max(1, limit), 50)");
    expect(scannerSource).toContain("limit: Math.min(Math.max(limit, 1), 25)");

    let claimedLimit = 0;
    const cleanup = createDeletedMessageCleanup({
      repository: {
        claimBatch: async ({ limit }) => { claimedLimit = limit; return []; },
        finalize: async () => true,
        release: async () => undefined
      },
      deleteObjectCopies: async () => undefined,
      logger: { info: () => undefined, warn: () => undefined }
    });
    await cleanup();
    expect(claimedLimit).toBe(deletedMessageCleanupBatchSize);
    expect(deletedMessageCleanupBatchSize).toBeLessThanOrEqual(100);
  });

  it("uses set-based topic aggregates instead of work proportional to message history", () => {
    const aggregateScope = apiRouteSource.match(/async function serializeTopics[\s\S]*?\n}\n\nasync function serializeTopic/)?.[0] ?? "";
    expect(aggregateScope).toContain("inArray(clubChatMessages.topicId, topicIds)");
    expect(aggregateScope).toContain(".groupBy(clubChatMessages.topicId)");
    expect(aggregateScope).toContain("topicStateRepository.getStates(currentUserId, topicIds)");
    expect(aggregateScope).not.toMatch(/topics\.map\([^)]*=>\s*serializeTopic/);
  });

  it("publishes invalidation identifiers instead of message histories", () => {
    const event = publishCommunityChange("topic-1");
    expect(event).toMatchObject({ type: "community.changed", topicId: "topic-1" });
    expect(Object.keys(event).sort()).toEqual(["createdAt", "id", "topicId", "type"]);
    expect(JSON.stringify(event)).not.toContain("messages");
  });

  it("limits multipart S3 requests to four and avoids API multipart parsing on direct-upload routes", () => {
    expect(browserUploadSource).toContain("const multipartConcurrency = 4");
    expect(browserUploadSource).toContain("runWithConcurrency(pendingParts, multipartConcurrency");
    const directUploadRoutes = apiRouteSource.match(/\.post\("\/uploads"[\s\S]*?\.get\("\/events"/)?.[0] ?? "";
    expect(directUploadRoutes).not.toContain("formData()");
    expect(directUploadRoutes).toContain("c.req.json()");
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
