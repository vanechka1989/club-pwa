import { describe, expect, it } from "vitest";
import {
  buildCommunityMediaObjectKey,
  getCommunityVoiceContentType,
  getCommunityVoiceStoragePlan,
  normalizeCommunityVoiceSource,
  validateCommunityImageFiles
} from "./mediaUpload";

describe("community media uploads", () => {
  it("normalizes mobile voice MIME types", () => {
    expect(getCommunityVoiceContentType("audio/webm;codecs=opus", "voice.webm")).toBe("audio/webm");
    expect(getCommunityVoiceContentType("video/mp4", "voice.m4a")).toBe("audio/mp4");
    expect(getCommunityVoiceContentType("application/octet-stream", "voice.ogg")).toBe("audio/ogg");
    expect(getCommunityVoiceContentType("application/octet-stream", "voice.exe")).toBeNull();
    expect(getCommunityVoiceContentType("audio/x-msdownload", "voice.exe")).toBeNull();
  });

  it("stores browser WebM voice recordings as iPhone-compatible M4A", () => {
    expect(getCommunityVoiceStoragePlan("audio/webm", "voice.webm")).toEqual({
      contentType: "audio/mp4",
      fileName: "voice.m4a",
      transcode: true
    });
    expect(getCommunityVoiceStoragePlan("audio/mp4", "voice.webm")).toEqual({
      contentType: "audio/mp4",
      fileName: "voice.m4a",
      transcode: true
    });
  });

  it("repairs Safari fragmented MP4 recordings that start before their file header", () => {
    const fragment = new Uint8Array([0, 0, 0, 12, 109, 111, 111, 102, 1, 2, 3, 4]);
    const header = new Uint8Array([0, 0, 0, 20, 102, 116, 121, 112, 105, 115, 111, 53, 0, 0, 0, 1, 105, 115, 111, 109]);
    const repaired = normalizeCommunityVoiceSource(new Uint8Array([...fragment, ...header]), "audio/mp4");

    expect(Array.from(repaired)).toEqual(Array.from(header));
    expect(normalizeCommunityVoiceSource(header, "audio/mp4")).toBe(header);
  });

  it("stores voice and image media under separate safe prefixes", () => {
    expect(buildCommunityMediaObjectKey("voice", "message-id", "asset-id", "My voice.webm")).toBe("community/voice/message-id/asset-id-my-voice.webm");
    expect(buildCommunityMediaObjectKey("image", "message-id", "asset-id", "Photo One.webp")).toBe("community/images/message-id/asset-id-photo-one.webp");
  });

  it("accepts up to ten images and rejects oversized files", () => {
    const image = (size: number) => ({ size, type: "image/jpeg", name: "photo.jpg" } as File);
    expect(validateCommunityImageFiles([image(1024)])).toBeNull();
    expect(validateCommunityImageFiles(Array.from({ length: 11 }, () => image(1024)))).toContain("10");
    expect(validateCommunityImageFiles([image(15 * 1024 * 1024 + 1)])).toContain("15 МБ");
    expect(validateCommunityImageFiles([{ size: 1024, type: "image/svg+xml", name: "unsafe.svg" } as File])).toContain("формат");
  });
});
