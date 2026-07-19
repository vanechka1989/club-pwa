import { createHash } from "node:crypto";

export const idempotencyOperationStatuses = ["processing", "succeeded", "failed"] as const;

function normalizeForFingerprint(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeForFingerprint);
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, normalizeForFingerprint(entry)])
  );
}

export function createRequestFingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(normalizeForFingerprint(value))).digest("hex");
}
