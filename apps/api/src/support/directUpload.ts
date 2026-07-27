import type { SupportUploadIntent, SupportUploadedObject } from "@club/shared";

const supportPendingPrefix = "support/pending";
const abandonedUploadAgeMs = 60 * 60 * 1000;

export function isSupportPendingObjectExpired(
  object: { key: string; lastModified: string | null },
  now = new Date()
) {
  if (!object.key.startsWith(`${supportPendingPrefix}/`) || !object.lastModified) return false;
  const modifiedAt = Date.parse(object.lastModified);
  return Number.isFinite(modifiedAt) && now.getTime() - modifiedAt > abandonedUploadAgeMs;
}

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

export function createSupportUploadIntent({
  userId,
  input,
  uploadToken,
  now = new Date()
}: {
  userId: string;
  input: SupportUploadIntent;
  uploadToken: string;
  now?: Date;
}) {
  const objectKey = buildSupportPendingObjectKey({ userId, uploadToken, fileName: input.fileName, now });
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);
  const uploadUrl = new URL(`/support/uploads/${uploadToken}`, "http://internal");
  uploadUrl.searchParams.set("objectKey", objectKey);
  uploadUrl.searchParams.set("fileName", input.fileName);
  uploadUrl.searchParams.set("contentType", input.contentType);
  uploadUrl.searchParams.set("sizeBytes", String(input.sizeBytes));
  uploadUrl.searchParams.set("expiresAt", expiresAt.toISOString());
  return {
    uploadUrl: `${uploadUrl.pathname}${uploadUrl.search}`,
    objectKey,
    uploadToken,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    expiresAt: expiresAt.toISOString()
  };
}

export async function verifySupportUploadedObjects({
  uploaded,
  userId,
  getMetadata,
  isConsumed
}: {
  uploaded: SupportUploadedObject[];
  userId: string;
  getMetadata: (key: string) => Promise<SupportObjectMetadata>;
  isConsumed: (key: string) => Promise<boolean>;
}) {
  const verified: ValidSupportObject[] = [];
  for (const item of uploaded) {
    if (await isConsumed(item.objectKey)) {
      throw new Error("support_object_already_consumed");
    }
    const validation = validateSupportUploadedObject({ uploaded: item, userId, metadata: await getMetadata(item.objectKey) });
    if (!validation.ok) {
      throw new Error(`support_${validation.error}`);
    }
    verified.push(validation.value);
  }
  return verified;
}

export function validateSupportUploadStreamRequest({
  uploaded,
  userId,
  contentLength,
  contentType,
  hasBody,
  expiresAt,
  now = new Date()
}: {
  uploaded: SupportUploadedObject;
  userId: string;
  contentLength: number | null;
  contentType: string;
  hasBody: boolean;
  expiresAt: Date;
  now?: Date;
}): { ok: true } | { ok: false; error: "foreign_object" | "missing_body" | "content_length_mismatch" | "content_type_mismatch" | "expired" } {
  const ownership = validateSupportUploadedObject({
    uploaded,
    userId,
    metadata: { key: uploaded.objectKey, contentType: uploaded.contentType, sizeBytes: uploaded.sizeBytes }
  });
  if (!ownership.ok) return { ok: false, error: "foreign_object" };
  if (expiresAt.getTime() < now.getTime()) return { ok: false, error: "expired" };
  if (!hasBody) return { ok: false, error: "missing_body" };
  if (contentLength !== uploaded.sizeBytes) return { ok: false, error: "content_length_mismatch" };
  if (contentType !== uploaded.contentType) return { ok: false, error: "content_type_mismatch" };
  return { ok: true };
}
