import { describe, expect, it, vi } from "vitest";
import { processCommunityMediaManifest } from "./mediaProcessor";

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
    complete: async () => undefined,
    fail: async () => undefined,
    ...overrides
  } as any;
}

describe("bounded community media processor", () => {
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
      expect.stringMatching(/^upload:community\/final\//),
      expect.stringMatching(/^mirror:community\/final\//),
      "complete",
      `delete:${manifest.quarantineObjectKey}`
    ]);
    expect(complete).toHaveBeenCalledWith(manifest.id, expect.objectContaining({
      contentType: "audio/mp4",
      durationSeconds: 300,
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
