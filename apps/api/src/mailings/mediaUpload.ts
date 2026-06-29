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
  const types: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    txt: "text/plain"
  };

  return types[extension] ?? null;
}

export type MailingAttachmentKind = "photo" | "video" | "document";

export function getMailingAttachmentUploadContentType(contentType: string, fileName: string) {
  if (contentType.startsWith("image/") || contentType.startsWith("video/")) {
    return contentType;
  }

  const normalized = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (
    normalized === "application/pdf" ||
    normalized === "application/msword" ||
    normalized === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    normalized === "application/vnd.ms-excel" ||
    normalized === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    normalized === "text/plain"
  ) {
    return normalized;
  }

  if (!contentType || contentType === "application/octet-stream") {
    return contentTypeFromExtension(fileName);
  }

  return null;
}

export function getMailingAttachmentKind(contentType: string): MailingAttachmentKind {
  if (contentType.startsWith("image/")) {
    return "photo";
  }

  if (contentType.startsWith("video/")) {
    return "video";
  }

  return "document";
}

export function buildMailingAttachmentObjectKey({
  fileName,
  id,
  now
}: {
  fileName: string;
  id: string;
  now: Date;
}) {
  return `mailings/${now.toISOString().slice(0, 10)}/${id}-${sanitizeFileName(fileName)}`;
}
