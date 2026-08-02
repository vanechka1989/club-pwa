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

type HomeworkUploadDescriptor = {
  objectKey: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
};

export function createHomeworkUploadIntent({
  userId,
  lessonId,
  uploadToken,
  input,
  now = new Date()
}: {
  userId: string;
  lessonId: string;
  uploadToken: string;
  input: Omit<HomeworkUploadDescriptor, "objectKey">;
  now?: Date;
}) {
  const objectKey = buildHomeworkObjectKey({ userId, token: uploadToken, fileName: input.fileName, now });
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);
  const uploadUrl = new URL(`/learning/items/${lessonId}/homework/uploads/${uploadToken}`, "http://internal");
  uploadUrl.searchParams.set("objectKey", objectKey);
  uploadUrl.searchParams.set("fileName", input.fileName);
  uploadUrl.searchParams.set("contentType", input.contentType);
  uploadUrl.searchParams.set("sizeBytes", String(input.sizeBytes));
  uploadUrl.searchParams.set("expiresAt", expiresAt.toISOString());
  return {
    uploadUrl: `${uploadUrl.pathname}${uploadUrl.search}`,
    objectKey,
    fileName: input.fileName,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    expiresAt: expiresAt.toISOString()
  };
}

export function validateHomeworkUploadStreamRequest({
  uploaded,
  userId,
  uploadToken,
  contentLength,
  contentType,
  hasBody,
  expiresAt,
  now = new Date()
}: {
  uploaded: HomeworkUploadDescriptor;
  userId: string;
  uploadToken: string;
  contentLength: number | null;
  contentType: string;
  hasBody: boolean;
  expiresAt: Date;
  now?: Date;
}): { ok: true } | { ok: false; error: "foreign_object" | "missing_body" | "content_length_mismatch" | "content_type_mismatch" | "expired" } {
  const tokenMarker = `/${sanitizeKeyPart(uploadToken)}-`;
  if (!ownsHomeworkObject(uploaded.objectKey, userId) || !uploaded.objectKey.includes(tokenMarker)) return { ok: false, error: "foreign_object" };
  if (expiresAt.getTime() < now.getTime()) return { ok: false, error: "expired" };
  if (!hasBody) return { ok: false, error: "missing_body" };
  if (contentLength !== uploaded.sizeBytes) return { ok: false, error: "content_length_mismatch" };
  if (contentType !== uploaded.contentType) return { ok: false, error: "content_type_mismatch" };
  return { ok: true };
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
