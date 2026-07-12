import { describe, expect, it } from "vitest";
import { buildCommunityMediaObjectKey, getCommunityVoiceContentType, validateCommunityImageFiles } from "./mediaUpload";

describe("community media uploads", () => {
  it("normalizes mobile voice MIME types", () => {
    expect(getCommunityVoiceContentType("audio/webm;codecs=opus", "voice.webm")).toBe("audio/webm");
    expect(getCommunityVoiceContentType("video/mp4", "voice.m4a")).toBe("audio/mp4");
    expect(getCommunityVoiceContentType("application/octet-stream", "voice.ogg")).toBe("audio/ogg");
    expect(getCommunityVoiceContentType("application/octet-stream", "voice.exe")).toBeNull();
    expect(getCommunityVoiceContentType("audio/x-msdownload", "voice.exe")).toBeNull();
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
