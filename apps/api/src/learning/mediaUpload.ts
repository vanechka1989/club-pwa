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
