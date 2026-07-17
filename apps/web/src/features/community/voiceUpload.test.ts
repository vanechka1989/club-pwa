import { describe, expect, it } from "vitest";
import { getCommunityVoiceUploadFileName, getPreferredCommunityVoiceMimeType } from "./voiceUpload";

describe("community voice upload", () => {
  it("keeps the upload filename aligned with the recorded MIME type", () => {
    expect(getCommunityVoiceUploadFileName("audio/mp4")).toBe("voice.m4a");
    expect(getCommunityVoiceUploadFileName("video/mp4")).toBe("voice.m4a");
    expect(getCommunityVoiceUploadFileName("audio/ogg")).toBe("voice.ogg");
    expect(getCommunityVoiceUploadFileName("audio/webm;codecs=opus")).toBe("voice.webm");
  });

  it("prefers iPhone-compatible MP4 recording when the browser supports it", () => {
    expect(getPreferredCommunityVoiceMimeType((type) => type === "audio/mp4")).toBe("audio/mp4");
    expect(getPreferredCommunityVoiceMimeType((type) => type === "audio/webm;codecs=opus")).toBe("audio/webm;codecs=opus");
  });
});
