import { describe, expect, it } from "vitest";
import { buildLearningMediaObjectKey, isLearningMediaContentTypeAllowed } from "./mediaUpload";

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
});
