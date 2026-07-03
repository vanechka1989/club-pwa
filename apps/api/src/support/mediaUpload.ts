function sanitizeFileName(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 96) || "attachment"
  );
}

function contentTypeFromExtension(fileName: string) {
  const extension = fileName.toLowerCase().split(".").pop() ?? "";
  const imageTypes: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp"
  };
  const videoTypes: Record<string, string> = {
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm"
  };

  return imageTypes[extension] ?? videoTypes[extension] ?? null;
}

export const supportAttachmentLimits = {
  maxFiles: 4,
  maxFileBytes: 50 * 1024 * 1024,
  maxTotalBytes: 100 * 1024 * 1024
} as const;

export type SupportAttachmentLimitError = "too_many_files" | "file_too_large" | "total_too_large";

export function getSupportAttachmentLimitError(files: Array<{ size: number }>): SupportAttachmentLimitError | null {
  if (files.length > supportAttachmentLimits.maxFiles) {
    return "too_many_files";
  }

  if (files.some((file) => file.size > supportAttachmentLimits.maxFileBytes)) {
    return "file_too_large";
  }

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > supportAttachmentLimits.maxTotalBytes) {
    return "total_too_large";
  }

  return null;
}

export function getSupportAttachmentUploadContentType(contentType: string, fileName: string) {
  if (contentType.startsWith("image/") || contentType.startsWith("video/")) {
    return contentType;
  }

  if (!contentType || contentType === "application/octet-stream") {
    return contentTypeFromExtension(fileName);
  }

  return null;
}

export function getSupportAttachmentExpiresAt(createdAt: Date) {
  return new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);
}

export function buildSupportAttachmentObjectKey({
  fileName,
  id,
  now
}: {
  fileName: string;
  id: string;
  now: Date;
}) {
  return `support/${now.toISOString().slice(0, 10)}/${id}-${sanitizeFileName(fileName)}`;
}
