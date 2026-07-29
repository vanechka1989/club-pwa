export const communityUploadCleanupPolicy = {
  immediatelyReclaimableStatuses: [
    "uploading",
    "aborting",
    "pending",
    "ready",
    "failed",
    "cleanup_pending",
    "rejected"
  ],
  staleStatuses: ["completing", "processing", "normalizing", "publishing", "scanning"],
  staleAfterMs: 15 * 60_000
} as const;

export const communityMediaCleanupPolicy = {
  retryStatuses: ["cleanup_pending", "published_cleanup_pending"],
  retryAfterMs: 30_000,
  staleStatuses: ["staged", "publishing"],
  staleAfterMs: 2 * 60_000
} as const;
