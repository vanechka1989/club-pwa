import { describe, expect, it, vi } from "vitest";
import {
  cleanupCommunityMediaCandidate,
  getCommunityMediaCandidateRecoveryAction,
  processCommunityMediaManifest,
  shouldProcessCommunityMediaManifest
} from "./mediaProcessor";

const manifest = {
  id: "manifest-1",
  userId: "11111111-1111-4111-8111-111111111111",
  uploadToken: "22222222-2222-4222-8222-222222222222",
  kind: "voice" as const,
  quarantineObjectKey: "community/quarantine/u/2026-07-29/token-voice.webm",
  fileName: "voice.webm",
  contentType: "audio/webm",
  sizeBytes: 1024,
  durationSeconds: 1
};

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    withWorkspace: async (work: (paths: { inputPath: string; outputPath: string }) => Promise<unknown>) => work({ inputPath: "C:/tmp/input", outputPath: "C:/tmp/output" }),
    downloadToFile: async () => undefined,
    normalizeImageFile: async () => ({ fileName: "photo.webp", contentType: "image/webp", sizeBytes: 50, width: 20, height: 10 }),
    probeDuration: async () => 3.2,
    transcodeVoiceFile: async () => undefined,
    uploadFile: async () => undefined,
    mirrorToReserve: async () => undefined,
    deleteCopies: async () => undefined,
    registerCandidate: async () => ({ id: "publication-1" }),
    withCandidatePublication: async (_publication: unknown, work: () => Promise<unknown>) => work(),
    cleanupCandidate: async () => undefined,
    complete: async () => undefined,
    fail: async () => undefined,
    ...overrides
  } as any;
}

describe("bounded community media processor", () => {
  it("does no media work until the manifest is attached", () => {
    expect(shouldProcessCommunityMediaManifest({ status: "processing", attachmentId: null })).toBe(false);
    expect(shouldProcessCommunityMediaManifest({ status: "processing", attachmentId: "attachment-1" })).toBe(true);
  });

  it("does not delete winner-owned objects when a stale worker loses its failure lease", async () => {
    const deleteCopies = vi.fn(async () => undefined);
    const fail = vi.fn(async () => false);
    await expect(processCommunityMediaManifest(manifest, dependencies({
      downloadToFile: async () => { throw new Error("late worker failure"); },
      deleteCopies,
      fail
    }))).resolves.toBe("lease_lost");
    expect(fail).toHaveBeenCalledTimes(1);
    expect(deleteCopies).not.toHaveBeenCalled();
  });

  it("does not delete winner-owned objects when stale success is fenced at completion", async () => {
    const deleteCopies = vi.fn(async () => undefined);
    await expect(processCommunityMediaManifest(manifest, dependencies({
      complete: async () => { throw new Error("manifest_lease_lost"); },
      deleteCopies
    }))).rejects.toThrow("manifest_lease_lost");
    expect(deleteCopies).not.toHaveBeenCalled();
  });

  it("keeps the winner object immutable when a stale worker uploads after lease reassignment", async () => {
    const objects = new Map<string, string>();
    const state: { lease: string; status: string; finalObjectKey: string | null } = {
      lease: "lease-a",
      status: "normalizing",
      finalObjectKey: null
    };
    let signalLoserAtUpload!: () => void;
    let releaseLoserUpload!: () => void;
    const loserAtUpload = new Promise<void>((resolve) => { signalLoserAtUpload = resolve; });
    const winnerDone = new Promise<void>((resolve) => { releaseLoserUpload = resolve; });

    const runWorker = (leaseToken: string, payload: string, pauseBeforeUpload = false) => processCommunityMediaManifest({
      ...manifest,
      kind: "image" as const,
      fileName: "photo.png",
      contentType: "image/png",
      leaseToken
    }, dependencies({
      normalizeImageFile: async () => ({ fileName: "photo.webp", contentType: "image/webp", sizeBytes: 50, width: 20, height: 10 }),
      uploadFile: async ({ key }: { key: string }) => {
        if (pauseBeforeUpload) {
          signalLoserAtUpload();
          await winnerDone;
        }
        objects.set(key, payload);
      },
      complete: async (_manifestId: string, result: { candidateObjectKey: string; finalObjectKey: string }) => {
        if (state.lease !== leaseToken || state.status !== "normalizing") throw new Error("manifest_lease_lost");
        objects.set(result.finalObjectKey, objects.get(result.candidateObjectKey)!);
        objects.delete(result.candidateObjectKey);
        state.status = "ready";
        state.finalObjectKey = result.finalObjectKey;
      },
      cleanupCandidate: async (_manifestId: string, key: string) => { objects.delete(key); },
      deleteCopies: async (key: string) => { objects.delete(key); }
    }));

    const loser = runWorker("lease-a", "loser-bytes", true);
    await loserAtUpload;
    state.lease = "lease-b";
    await expect(runWorker("lease-b", "winner-bytes")).resolves.toBe("ready");
    releaseLoserUpload();
    await expect(loser).rejects.toThrow("manifest_lease_lost");

    expect(state).toMatchObject({ lease: "lease-b", status: "ready" });
    expect(state.finalObjectKey).toBeTruthy();
    expect(objects).toEqual(new Map([[state.finalObjectKey!, "winner-bytes"]]));
  });

  it("durably registers a candidate before upload and schedules both copies for cleanup after mirror failure", async () => {
    const events: string[] = [];
    const fail = vi.fn(async () => false);
    const cleanupCandidate = vi.fn(async (_manifestId: string, key: string) => { events.push(`cleanup:${key}`); });

    await expect(processCommunityMediaManifest({ ...manifest, leaseToken: "33333333-3333-4333-8333-333333333333" }, dependencies({
      registerCandidate: async (_manifestId: string, result: { candidateObjectKey: string }) => {
        events.push(`register:${result.candidateObjectKey}`);
      },
      uploadFile: async ({ key }: { key: string }) => { events.push(`upload:${key}`); },
      mirrorToReserve: async (key: string) => {
        events.push(`mirror:${key}`);
        throw new Error("reserve_unavailable");
      },
      cleanupCandidate,
      fail
    }))).resolves.toBe("lease_lost");

    expect(events).toEqual([
      expect.stringMatching(/^register:community\/candidates\//),
      expect.stringMatching(/^upload:community\/candidates\//),
      expect.stringMatching(/^mirror:community\/candidates\//),
      expect.stringMatching(/^cleanup:community\/candidates\//)
    ]);
    expect(cleanupCandidate).toHaveBeenCalledTimes(1);
  });

  it("keeps the delayed candidate upload and reserve mirror inside the durable publication fence", async () => {
    const events: string[] = [];
    const publication = { id: "publication-1" };

    await expect(processCommunityMediaManifest({ ...manifest, leaseToken: "44444444-4444-4444-8444-444444444444" }, dependencies({
      registerCandidate: async () => {
        events.push("publication:reserved");
        return publication;
      },
      withCandidatePublication: async (claim: unknown, work: () => Promise<unknown>) => {
        expect(claim).toBe(publication);
        events.push("publication:locked");
        const result = await work();
        events.push("publication:committed");
        return result;
      },
      uploadFile: async () => {
        events.push("candidate:uploaded");
        await new Promise<void>((resolve) => setImmediate(resolve));
      },
      mirrorToReserve: async () => { events.push("candidate:mirrored"); },
      complete: async () => { events.push("final:published"); },
      deleteCopies: async (key: string) => { events.push(`delete:${key}`); }
    }))).resolves.toBe("ready");

    expect(events.slice(0, 6)).toEqual([
      "publication:reserved",
      "publication:locked",
      "candidate:uploaded",
      "candidate:mirrored",
      "publication:committed",
      "final:published"
    ]);
  });

  it("sweeps an interrupted stale candidate and every uncommitted final copy", async () => {
    const deleted: Array<{ target: "primary" | "reserve"; key: string }> = [];
    const markComplete = vi.fn(async () => undefined);
    const result = await cleanupCommunityMediaCandidate({
      id: "candidate-a",
      candidateObjectKey: "community/candidates/user/day/lease-a-photo.webp",
      finalObjectKey: "community/final/user/day/lease-a-photo.webp",
      status: "staged",
      updatedAt: new Date("2026-07-29T00:00:00.000Z"),
      manifestStatus: "normalizing",
      leaseUpdatedAt: new Date("2026-07-29T00:00:00.000Z"),
      manifestUpdatedAt: new Date("2026-07-29T00:05:00.000Z")
    }, {
      claim: async () => true,
      deleteCopies: async (key) => {
        deleted.push({ target: "primary", key }, { target: "reserve", key });
      },
      markComplete,
      markRetry: async () => undefined
    });

    expect(result).toBe("cleaned");
    expect(deleted).toEqual([
      { target: "primary", key: "community/candidates/user/day/lease-a-photo.webp" },
      { target: "reserve", key: "community/candidates/user/day/lease-a-photo.webp" },
      { target: "primary", key: "community/final/user/day/lease-a-photo.webp" },
      { target: "reserve", key: "community/final/user/day/lease-a-photo.webp" }
    ]);
    expect(markComplete).toHaveBeenCalledWith("candidate-a", "cleaned");
  });

  it("reclaims a primary-promoted candidate when expiry wins during reserve mirroring", async () => {
    const candidate = {
      id: "candidate-a",
      candidateObjectKey: "community/candidates/user/day/lease-a-photo.webp",
      finalObjectKey: "community/final/user/day/lease-a-photo.webp",
      status: "publishing" as const,
      updatedAt: new Date("2026-07-29T00:00:00.000Z"),
      manifestStatus: "aborted",
      leaseUpdatedAt: new Date("2026-07-29T00:00:00.000Z"),
      manifestUpdatedAt: new Date("2026-07-29T00:05:00.000Z")
    };
    expect(getCommunityMediaCandidateRecoveryAction(candidate, {
      status: "aborted",
      finalObjectKey: null
    })).toBe("discard");

    const primary = new Set([candidate.candidateObjectKey, candidate.finalObjectKey]);
    const reserve = new Set([candidate.candidateObjectKey]);
    await expect(cleanupCommunityMediaCandidate({ ...candidate, status: "cleanup_pending" }, {
      claim: async () => true,
      deleteCopies: async (key) => {
        primary.delete(key);
        reserve.delete(key);
      },
      markComplete: async () => undefined,
      markRetry: async () => undefined
    })).resolves.toBe("cleaned");
    expect(primary).toEqual(new Set());
    expect(reserve).toEqual(new Set());
  });

  it("cleans only candidate copies after the final winner is committed", async () => {
    const candidate = {
      id: "candidate-a",
      candidateObjectKey: "community/candidates/user/day/lease-a-photo.webp",
      finalObjectKey: "community/final/user/day/lease-a-photo.webp",
      status: "published_cleanup_pending" as const,
      updatedAt: new Date("2026-07-29T00:00:00.000Z"),
      manifestStatus: "ready",
      leaseUpdatedAt: new Date("2026-07-29T00:00:00.000Z"),
      manifestUpdatedAt: new Date("2026-07-29T00:05:00.000Z")
    };
    expect(getCommunityMediaCandidateRecoveryAction({ ...candidate, status: "publishing" }, {
      status: "ready",
      finalObjectKey: candidate.finalObjectKey
    })).toBe("cleanup_candidate");
    const deleted: string[] = [];
    await cleanupCommunityMediaCandidate(candidate, {
      claim: async () => true,
      deleteCopies: async (key) => { deleted.push(key); },
      markComplete: async () => undefined,
      markRetry: async () => undefined
    });
    expect(deleted).toEqual([candidate.candidateObjectKey]);
  });

  it("leaves failed candidate cleanup retryable and succeeds on the next sweep", async () => {
    const candidate = {
      id: "candidate-a",
      candidateObjectKey: "community/candidates/user/day/lease-a-photo.webp",
      finalObjectKey: "community/final/user/day/lease-a-photo.webp",
      status: "cleanup_pending" as const,
      updatedAt: new Date("2026-07-29T00:00:00.000Z"),
      manifestStatus: "failed",
      leaseUpdatedAt: new Date("2026-07-29T00:00:00.000Z"),
      manifestUpdatedAt: new Date("2026-07-29T00:05:00.000Z")
    };
    let attempts = 0;
    const markRetry = vi.fn(async () => undefined);
    const markComplete = vi.fn(async () => undefined);
    const cleanup = {
      claim: async () => true,
      deleteCopies: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("s3_timeout");
      },
      markComplete,
      markRetry
    };

    await expect(cleanupCommunityMediaCandidate(candidate, cleanup)).resolves.toBe("retry");
    await expect(cleanupCommunityMediaCandidate(candidate, cleanup)).resolves.toBe("cleaned");
    expect(markRetry).toHaveBeenCalledWith("candidate-a", "s3_timeout");
    expect(markComplete).toHaveBeenCalledWith("candidate-a", "cleaned");
  });

  it("rejects an actual voice duration over five minutes even when the client declared one second", async () => {
    const transcodeVoiceFile = vi.fn();
    const uploadFile = vi.fn();
    const fail = vi.fn(async () => undefined);
    const deleteCopies = vi.fn(async () => undefined);
    const result = await processCommunityMediaManifest(manifest, dependencies({
      probeDuration: async () => 301,
      transcodeVoiceFile,
      uploadFile,
      fail,
      deleteCopies
    }));

    expect(result).toBe("failed");
    expect(transcodeVoiceFile).not.toHaveBeenCalled();
    expect(uploadFile).not.toHaveBeenCalled();
    expect(fail).toHaveBeenCalledWith(manifest.id, "voice_duration_exceeded");
    expect(deleteCopies).toHaveBeenCalledWith(manifest.quarantineObjectKey);
  });

  it("streams through temporary paths, persists measured output duration, and promotes a new final key", async () => {
    const events: string[] = [];
    const complete = vi.fn(async () => { events.push("complete"); });
    let probeCalls = 0;
    const result = await processCommunityMediaManifest(manifest, dependencies({
      downloadToFile: async (key: string, path: string) => { events.push(`download:${key}:${path}`); },
      probeDuration: async (path: string) => { events.push(`probe:${path}`); probeCalls += 1; return probeCalls === 1 ? 299.4 : 299.2; },
      transcodeVoiceFile: async (input: string, output: string) => { events.push(`transcode:${input}:${output}`); },
      uploadFile: async ({ key, path }: { key: string; path: string }) => { events.push(`upload:${key}:${path}`); },
      mirrorToReserve: async (key: string) => { events.push(`mirror:${key}`); },
      deleteCopies: async (key: string) => { events.push(`delete:${key}`); },
      complete
    }));

    expect(result).toBe("ready");
    expect(events).toEqual([
      `download:${manifest.quarantineObjectKey}:C:/tmp/input`,
      "probe:C:/tmp/input",
      "transcode:C:/tmp/input:C:/tmp/output",
      "probe:C:/tmp/output",
      expect.stringMatching(/^upload:community\/candidates\//),
      expect.stringMatching(/^mirror:community\/candidates\//),
      "complete",
      `delete:${manifest.quarantineObjectKey}`
    ]);
    expect(complete).toHaveBeenCalledWith(manifest.id, expect.objectContaining({
      contentType: "audio/mp4",
      durationSeconds: 300,
      candidateObjectKey: expect.stringMatching(/^community\/candidates\//),
      finalObjectKey: expect.stringMatching(/^community\/final\//)
    }));
  });

  it("preserves both source and promoted output for retry when durable completion is uncertain", async () => {
    const deleteCopies = vi.fn(async () => undefined);
    const fail = vi.fn(async () => undefined);
    await expect(processCommunityMediaManifest(manifest, dependencies({
      complete: async () => { throw new Error("database_timeout"); },
      deleteCopies,
      fail
    }))).rejects.toThrow("database_timeout");

    expect(deleteCopies).not.toHaveBeenCalled();
    expect(fail).not.toHaveBeenCalled();
  });
});
