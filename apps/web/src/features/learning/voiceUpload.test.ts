import { describe, expect, it } from "vitest";
import { createVoiceUpload } from "./voiceUpload";

describe("createVoiceUpload", () => {
  it("prepares recorded voice as a named blob for FormData upload", () => {
    const upload = createVoiceUpload([new Blob(["voice"], { type: "audio/webm;codecs=opus" })], "audio/webm;codecs=opus");

    expect(upload.name).toBe("voice-message.webm");
    expect(upload.blob).toBeInstanceOf(Blob);
    expect(upload.blob.type).toBe("audio/webm;codecs=opus");
  });

  it("falls back to webm when recorder mime type is missing", () => {
    const upload = createVoiceUpload([new Blob(["voice"])], "");

    expect(upload.name).toBe("voice-message.webm");
    expect(upload.blob.type).toBe("audio/webm");
  });

  it("uses m4a extension for mp4 audio", () => {
    const upload = createVoiceUpload([new Blob(["voice"], { type: "audio/mp4" })], "audio/mp4");

    expect(upload.name).toBe("voice-message.m4a");
  });

  it("normalizes audio-only webm recordings reported as video webm", () => {
    const upload = createVoiceUpload([new Blob(["voice"], { type: "video/webm;codecs=opus" })], "video/webm;codecs=opus");

    expect(upload.name).toBe("voice-message.webm");
    expect(upload.blob.type).toBe("audio/webm;codecs=opus");
  });
});
