import type { ContentKind } from "@club/shared";

export function formatPlaybackTime(seconds: number) {
  const normalizedSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(normalizedSeconds / 3600);
  const minutes = Math.floor((normalizedSeconds % 3600) / 60);
  const remainingSeconds = normalizedSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function getLearningKindLabel(kind: ContentKind) {
  if (kind === "video") {
    return "Видео";
  }

  if (kind === "audio") {
    return "Аудио";
  }

  if (kind === "photo") {
    return "Фото";
  }

  return "Текст";
}

export function formatLearningPlaybackLabel(kind: ContentKind, seconds: number) {
  if ((kind === "video" || kind === "audio") && seconds > 0) {
    return `Продолжить с ${formatPlaybackTime(seconds)}`;
  }

  return "Открыть контент";
}
