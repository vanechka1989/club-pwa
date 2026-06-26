import { describe, expect, it } from "vitest";
import { getMaterialDraftError } from "./materialForm";

describe("getMaterialDraftError", () => {
  it("requires a title before saving", () => {
    expect(
      getMaterialDraftError({
        title: "",
        kind: "text",
        isEditing: false,
        currentKind: null,
        currentMediaUrl: null,
        hasMediaFile: false,
        isVoiceRecording: false,
        isVoiceProcessing: false
      })
    ).toBe("Введите название контента.");
  });

  it("requires a ready audio file before creating audio content", () => {
    expect(
      getMaterialDraftError({
        title: "Аудио",
        kind: "audio",
        isEditing: false,
        currentKind: null,
        currentMediaUrl: null,
        hasMediaFile: false,
        isVoiceRecording: false,
        isVoiceProcessing: false
      })
    ).toBe("Запишите голосовое сообщение или выберите аудиофайл.");
  });

  it("blocks saving while voice recording is still preparing", () => {
    expect(
      getMaterialDraftError({
        title: "Аудио",
        kind: "audio",
        isEditing: false,
        currentKind: null,
        currentMediaUrl: null,
        hasMediaFile: false,
        isVoiceRecording: false,
        isVoiceProcessing: true
      })
    ).toBe("Дождитесь подготовки голосового сообщения.");
  });

  it("allows editing existing audio without replacing the file", () => {
    expect(
      getMaterialDraftError({
        title: "Аудио",
        kind: "audio",
        isEditing: true,
        currentKind: "audio",
        currentMediaUrl: "https://example.com/audio.webm",
        hasMediaFile: false,
        isVoiceRecording: false,
        isVoiceProcessing: false
      })
    ).toBeNull();
  });
});
