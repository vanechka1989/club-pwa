import type { S3ObjectSourceSnapshot } from "../storage/s3ObjectSource";

type S3DeletionAuditLog = {
  action: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
};

const sourceKinds = new Set([
  "learning",
  "lesson_material",
  "community",
  "support",
  "mailing",
  "notification",
  "other"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getS3DeletionAuditKey(log: S3DeletionAuditLog): string | null {
  if (log.action !== "storage.s3.object.deleted") {
    return null;
  }

  const metadataKey = log.metadata.key;
  if (typeof metadataKey === "string" && metadataKey.trim()) {
    return metadataKey.trim();
  }

  return log.entityId?.trim() || null;
}

export function hasS3DeletionSource(metadata: Record<string, unknown>): boolean {
  const source = metadata.source;
  return Boolean(
    isRecord(source)
      && typeof source.category === "string"
      && typeof source.categoryLabel === "string"
      && typeof source.fileKind === "string"
      && typeof source.sourceKind === "string"
      && sourceKinds.has(source.sourceKind)
      && (typeof source.sourceTitle === "string" || source.sourceTitle === null)
      && (typeof source.parentTitle === "string" || source.parentTitle === null)
      && typeof source.resolved === "boolean"
  );
}

export function mergeS3DeletionSource(
  metadata: Record<string, unknown>,
  source: S3ObjectSourceSnapshot
): Record<string, unknown> {
  return { ...metadata, source };
}
