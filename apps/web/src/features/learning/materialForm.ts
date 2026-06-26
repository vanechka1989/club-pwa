import type { ContentKind } from "@club/shared";

export type MaterialDraftValidationInput = {
  title: string;
  kind: ContentKind;
  isEditing: boolean;
  currentKind: ContentKind | null;
  currentMediaUrl: string | null;
  hasMediaFile: boolean;
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

  const requiresMedia =
    input.kind !== "text" && (!input.isEditing || input.currentKind !== input.kind || !input.currentMediaUrl);

  if (requiresMedia && !input.hasMediaFile) {
    return mediaRequiredMessage(input.kind);
  }

  return null;
}
