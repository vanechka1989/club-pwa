import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildLearningMediaObjectKey, getLearningMediaUploadContentType, isLearningMediaContentTypeAllowed } from "./mediaUpload";

describe("learning media upload helpers", () => {
  it("accepts audio files and stores them under the audio prefix", () => {
    expect(isLearningMediaContentTypeAllowed("audio", "audio/webm;codecs=opus")).toBe(true);
    expect(isLearningMediaContentTypeAllowed("audio", "video/webm")).toBe(false);

    expect(
      buildLearningMediaObjectKey({
        kind: "audio",
        fileName: "voice message.webm",
        id: "upload-id",
        now: new Date("2026-06-26T10:00:00.000Z")
      })
    ).toBe("learning/audio/2026-06-26/upload-id-voice-message.webm");
  });

  it("normalizes recorded audio when mobile webviews upload it as an opaque file", () => {
    expect(getLearningMediaUploadContentType("audio", "application/octet-stream", "voice-message.webm")).toBe("audio/webm");
    expect(getLearningMediaUploadContentType("audio", "", "voice-message.m4a")).toBe("audio/mp4");
    expect(getLearningMediaUploadContentType("audio", "video/mp4", "voice-message.m4a")).toBe("audio/mp4");
    expect(getLearningMediaUploadContentType("audio", "application/octet-stream", "voice-message.exe")).toBeNull();
  });

  it("returns structured transient errors from the multipart proxy", () => {
    const adminRoutes = readFileSync(resolve(__dirname, "../routes/admin.ts"), "utf-8");

    expect(adminRoutes).toContain('code: "UPLOAD_CONNECTION_CLOSED"');
    expect(adminRoutes).toContain('code: "STORAGE_UNAVAILABLE"');
    expect(adminRoutes).toContain('"Retry-After", "1"');
  });
});
