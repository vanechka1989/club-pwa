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
