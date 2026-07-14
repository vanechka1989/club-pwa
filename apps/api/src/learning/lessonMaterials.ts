import type { ContentKind } from "@club/shared";

const internalMaterialKindLabels: Record<ContentKind, string> = {
  text: "Текст",
  photo: "Фото",
  video: "Видео",
  audio: "Аудио"
};

export function getInternalLessonMaterialTitle(kind: ContentKind, title: string | undefined, index: number) {
  return title?.trim() || `${internalMaterialKindLabels[kind]} ${index + 1}`;
}
