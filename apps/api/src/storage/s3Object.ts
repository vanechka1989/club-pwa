export type S3ObjectCategory = "learning" | "support" | "mailings" | "notifications" | "other";

export function classifyS3ObjectKey(key: string): {
  category: S3ObjectCategory;
  categoryLabel: string;
  fileKind: string;
} {
  const normalizedKey = key.trim().replace(/^\/+/, "").replace(/\/{2,}/g, "/");

  if (normalizedKey.startsWith("learning/thumbnails/")) {
    return { category: "learning", categoryLabel: "Уроки", fileKind: "Обложка урока" };
  }

  if (normalizedKey.startsWith("learning/video/")) {
    return { category: "learning", categoryLabel: "Уроки", fileKind: "Видео урока" };
  }

  if (normalizedKey.startsWith("learning/audio/")) {
    return { category: "learning", categoryLabel: "Уроки", fileKind: "Аудио урока" };
  }

  if (normalizedKey.startsWith("learning/photo/")) {
    return { category: "learning", categoryLabel: "Уроки", fileKind: "Фото урока" };
  }

  if (normalizedKey.startsWith("support/")) {
    return { category: "support", categoryLabel: "Поддержка", fileKind: "Файл обращения" };
  }

  if (normalizedKey.startsWith("mailings/")) {
    return { category: "mailings", categoryLabel: "Рассылки", fileKind: "Вложение рассылки" };
  }

  if (normalizedKey.startsWith("notifications/")) {
    return { category: "notifications", categoryLabel: "Уведомления", fileKind: "Вложение уведомления" };
  }

  return { category: "other", categoryLabel: "Прочее", fileKind: "Файл" };
}

export function normalizeS3ObjectPrefix(value: string | null | undefined) {
  const trimmed = value?.trim().replace(/^\/+/, "").replace(/\/{2,}/g, "/") ?? "";
  if (!trimmed) {
    return "";
  }

  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

export function normalizeS3ObjectKey(value: string) {
  const key = value.trim().replace(/^\/+/, "").replace(/\/{2,}/g, "/");
  if (!key) {
    throw new Error("S3 object key is required");
  }

  if (key.endsWith("/")) {
    throw new Error("S3 object key must point to a file");
  }

  return key;
}
