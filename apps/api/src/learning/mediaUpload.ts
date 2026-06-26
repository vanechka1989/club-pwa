import type { ContentKind } from "@club/shared";

function sanitizeFileName(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 96) || "material"
  );
}

export function isLearningMediaContentTypeAllowed(kind: ContentKind, contentType: string) {
  return (
    (kind === "photo" && contentType.startsWith("image/")) ||
    (kind === "video" && contentType.startsWith("video/")) ||
    (kind === "audio" && contentType.startsWith("audio/"))
  );
}

function extensionFromFileName(fileName: string) {
  return fileName.toLowerCase().split(".").pop() ?? "";
}

function audioContentTypeFromExtension(fileName: string) {
  const extension = extensionFromFileName(fileName);

  if (extension === "webm") {
    return "audio/webm";
  }

  if (extension === "m4a" || extension === "mp4") {
    return "audio/mp4";
  }

  if (extension === "mp3") {
    return "audio/mpeg";
  }

  if (extension === "ogg" || extension === "opus") {
    return "audio/ogg";
  }

  if (extension === "wav") {
    return "audio/wav";
  }

  if (extension === "aac") {
    return "audio/aac";
  }

  return null;
}

export function getLearningMediaUploadContentType(kind: ContentKind, contentType: string, fileName: string) {
  if (isLearningMediaContentTypeAllowed(kind, contentType)) {
    return contentType;
  }

  if (kind !== "audio") {
    return null;
  }

  if (contentType.startsWith("video/")) {
    return contentType.replace(/^video\//i, "audio/");
  }

  if (!contentType || contentType === "application/octet-stream") {
    return audioContentTypeFromExtension(fileName);
  }

  return null;
}

export function buildLearningMediaObjectKey({
  kind,
  fileName,
  id,
  now
}: {
  kind: ContentKind;
  fileName: string;
  id: string;
  now: Date;
}) {
  return `learning/${kind}/${now.toISOString().slice(0, 10)}/${id}-${sanitizeFileName(fileName)}`;
}

export function buildLearningThumbnailObjectKey({ fileName, id, now }: { fileName: string; id: string; now: Date }) {
  return `learning/thumbnails/${now.toISOString().slice(0, 10)}/${id}-${sanitizeFileName(fileName)}`;
}
