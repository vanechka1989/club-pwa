import type { HomeworkFileKind } from "@club/shared";

function sanitizeKeyPart(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-").replace(/^[.-]+|[.-]+$/g, "").slice(0, 96) || "file";
}

export function buildHomeworkObjectKey({ userId, token, fileName, now = new Date() }: {
  userId: string;
  token: string;
  fileName: string;
  now?: Date;
}) {
  return `homework/pending/${sanitizeKeyPart(userId)}/${now.toISOString().slice(0, 10)}/${sanitizeKeyPart(token)}-${sanitizeKeyPart(fileName)}`;
}

export function ownsHomeworkObject(objectKey: string, userId: string) {
  return objectKey.startsWith(`homework/pending/${sanitizeKeyPart(userId)}/`);
}

export function classifyHomeworkContentType(contentType: string): HomeworkFileKind | null {
  const normalized = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (normalized.startsWith("image/")) return "image";
  if (normalized.startsWith("video/")) return "video";
  if ([
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain"
  ].includes(normalized)) return "document";
  return null;
}
