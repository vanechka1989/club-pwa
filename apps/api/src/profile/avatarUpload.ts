export const avatarUploadLimits = {
  maxFileBytes: 5 * 1024 * 1024
} as const;

const allowedContentTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const extensionContentTypes = new Map([
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"]
]);

function normalizeContentType(contentType: string) {
  return contentType.toLowerCase().split(";")[0]?.trim() ?? "";
}

function getFileExtension(fileName: string) {
  const extension = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return extension ?? "";
}

export function getAvatarUploadContentType(contentType: string, fileName: string) {
  const normalized = normalizeContentType(contentType);
  if (allowedContentTypes.has(normalized)) {
    return normalized;
  }

  if (normalized && normalized !== "application/octet-stream") {
    return null;
  }

  return extensionContentTypes.get(getFileExtension(fileName)) ?? null;
}

export function getAvatarUploadLimitError(file: { size: number }) {
  if (file.size <= 0) {
    return "empty_file";
  }

  if (file.size > avatarUploadLimits.maxFileBytes) {
    return "file_too_large";
  }

  return null;
}

function sanitizeKeyPart(value: string) {
  const sanitized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return sanitized || "avatar";
}

export function buildAvatarObjectKey({
  userId,
  fileName,
  id,
  now = new Date()
}: {
  userId: string;
  fileName: string;
  id: string;
  now?: Date;
}) {
  const datePrefix = now.toISOString().slice(0, 10);
  const extension = getFileExtension(fileName) || "webp";
  const baseName = fileName.replace(/\.[^.\\/]+$/, "");
  const safeFileName = `${sanitizeKeyPart(baseName)}.${extension}`;

  return `avatars/${datePrefix}/${sanitizeKeyPart(userId)}-${sanitizeKeyPart(id)}-${safeFileName}`;
}
