export const learningMaterialCreateScope = "learning.material.create";
export const idempotencyOperationTtlMs = 30 * 24 * 60 * 60 * 1000;

type ExistingLearningSaveOperation = {
  requestFingerprint: string;
  status: string;
  resourceId: string | null;
  errorCode: string | null;
};

export function decideLearningSaveClaim(existing: ExistingLearningSaveOperation | null, requestFingerprint: string) {
  if (!existing) {
    return { kind: "create" } as const;
  }
  if (existing.requestFingerprint !== requestFingerprint) {
    return { kind: "conflict" } as const;
  }
  if (existing.status === "succeeded") {
    return { kind: "succeeded", resourceId: existing.resourceId } as const;
  }
  if (existing.status === "failed") {
    return { kind: "failed", errorCode: existing.errorCode } as const;
  }
  return { kind: "processing" } as const;
}
