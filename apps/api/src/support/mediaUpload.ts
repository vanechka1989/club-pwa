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

export function getSupportAttachmentUploadContentType(contentType: string, fileName: string) {
  if (contentType.startsWith("image/") || contentType.startsWith("video/")) {
    return contentType;
  }

  if (!contentType || contentType === "application/octet-stream") {
    return contentTypeFromExtension(fileName);
  }

  return null;
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
