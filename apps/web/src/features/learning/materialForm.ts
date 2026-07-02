import { getYouTubeEmbedUrl, normalizeExternalMediaUrl, type ContentKind } from "@club/shared";

export type MediaInputSource = "file" | "url" | "youtube";

export type MaterialDraftValidationInput = {
  title: string;
  kind: ContentKind;
  isEditing: boolean;
  currentKind: ContentKind | null;
  currentMediaUrl: string | null;
  hasMediaFile: boolean;
  externalMediaUrl?: string;
  mediaSource?: MediaInputSource;
  isVoiceRecording: boolean;
  isVoiceProcessing: boolean;
};

function mediaRequiredMessage(kind: ContentKind) {
  if (kind === "audio") {
    return "Запишите голосовое сообщение или выберите аудиофайл.";
  }

  if (kind === "photo") {
    return "Выберите фото для контента.";
  }

  if (kind === "video") {
    return "Выберите видео для контента.";
  }

  return null;
}

export function getMaterialDraftError(input: MaterialDraftValidationInput) {
  if (!input.title.trim()) {
    return "Введите название контента.";
  }

  if (input.kind === "audio" && input.isVoiceRecording) {
    return "Остановите запись голосового сообщения перед сохранением.";
  }

  if (input.kind === "audio" && input.isVoiceProcessing) {
    return "Дождитесь подготовки голосового сообщения.";
  }

  const mediaSource = input.mediaSource ?? "file";
  if (input.kind !== "text" && mediaSource === "youtube") {
    if (input.kind !== "video") {
      return "YouTube можно добавить только для видео.";
    }

    if (!getYouTubeEmbedUrl(input.externalMediaUrl)) {
      return "Введите корректную ссылку YouTube.";
    }

    return null;
  }

  if (input.kind !== "text" && mediaSource === "url") {
    if (!normalizeExternalMediaUrl(input.externalMediaUrl)) {
      return "Введите корректную ссылку на файл.";
    }

    return null;
  }

  const requiresMedia =
    input.kind !== "text" && (!input.isEditing || input.currentKind !== input.kind || !input.currentMediaUrl);

  if (requiresMedia && !input.hasMediaFile) {
    return mediaRequiredMessage(input.kind);
  }

  return null;
}
