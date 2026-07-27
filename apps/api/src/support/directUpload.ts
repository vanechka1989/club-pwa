import type { SupportUploadedObject } from "@club/shared";

const supportPendingPrefix = "support/pending";

function sanitizeKeyPart(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || "attachment";
}

export function buildSupportPendingObjectKey({
  userId,
  uploadToken,
  fileName,
  now = new Date()
}: {
  userId: string;
  uploadToken: string;
  fileName: string;
  now?: Date;
}) {
  return `${supportPendingPrefix}/${sanitizeKeyPart(userId)}/${now.toISOString().slice(0, 10)}/${sanitizeKeyPart(uploadToken)}-${sanitizeKeyPart(fileName)}`;
}

type SupportObjectMetadata = {
  key: string;
  contentType: string | null;
  sizeBytes: number | null;
};

type ValidSupportObject = {
  objectKey: string;
  fileName: string;
  contentType: SupportUploadedObject["contentType"];
  sizeBytes: number;
  kind: "photo" | "video";
};

export function validateSupportUploadedObject({
  uploaded,
  userId,
  metadata
}: {
  uploaded: SupportUploadedObject;
  userId: string;
  metadata: SupportObjectMetadata;
}): { ok: true; value: ValidSupportObject } | { ok: false; error: "foreign_object" | "metadata_mismatch" } {
  const expectedPrefix = `${supportPendingPrefix}/${sanitizeKeyPart(userId)}/`;
  const tokenMarker = `/${sanitizeKeyPart(uploaded.uploadToken)}-`;
  if (!uploaded.objectKey.startsWith(expectedPrefix) || !uploaded.objectKey.includes(tokenMarker)) {
    return { ok: false, error: "foreign_object" };
  }

  if (
    metadata.key !== uploaded.objectKey ||
    metadata.sizeBytes !== uploaded.sizeBytes ||
    metadata.sizeBytes <= 0 ||
    metadata.contentType !== uploaded.contentType
  ) {
    return { ok: false, error: "metadata_mismatch" };
  }

  return {
    ok: true,
    value: {
      objectKey: uploaded.objectKey,
      fileName: uploaded.fileName,
      contentType: uploaded.contentType,
      sizeBytes: uploaded.sizeBytes,
      kind: uploaded.contentType.startsWith("video/") ? "video" : "photo"
    }
  };
}
