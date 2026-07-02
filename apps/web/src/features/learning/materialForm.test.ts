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
        externalMediaUrl: "",
        mediaSource: "file",
        isVoiceRecording: false,
        isVoiceProcessing: false
      })
    ).toBeNull();
  });

  it("allows creating video content from a direct media link without uploading a file", () => {
    expect(
      getMaterialDraftError({
        title: "Видео",
        kind: "video",
        isEditing: false,
        currentKind: null,
        currentMediaUrl: null,
        hasMediaFile: false,
        externalMediaUrl: "https://cdn.example.com/video.mp4",
        mediaSource: "url",
        isVoiceRecording: false,
        isVoiceProcessing: false
      })
    ).toBeNull();
  });

  it("allows YouTube only for video content", () => {
    expect(
      getMaterialDraftError({
        title: "Видео",
        kind: "video",
        isEditing: false,
        currentKind: null,
        currentMediaUrl: null,
        hasMediaFile: false,
        externalMediaUrl: "https://youtu.be/dQw4w9WgXcQ",
        mediaSource: "youtube",
        isVoiceRecording: false,
        isVoiceProcessing: false
      })
    ).toBeNull();

    expect(
      getMaterialDraftError({
        title: "Фото",
        kind: "photo",
        isEditing: false,
        currentKind: null,
        currentMediaUrl: null,
        hasMediaFile: false,
        externalMediaUrl: "https://youtu.be/dQw4w9WgXcQ",
        mediaSource: "youtube",
        isVoiceRecording: false,
        isVoiceProcessing: false
      })
    ).toBe("YouTube можно добавить только для видео.");
  });

  it("rejects invalid external links", () => {
    expect(
      getMaterialDraftError({
        title: "Видео",
        kind: "video",
        isEditing: false,
        currentKind: null,
        currentMediaUrl: null,
        hasMediaFile: false,
        externalMediaUrl: "ftp://example.com/video.mp4",
        mediaSource: "url",
        isVoiceRecording: false,
        isVoiceProcessing: false
      })
    ).toBe("Введите корректную ссылку на файл.");
  });
});
