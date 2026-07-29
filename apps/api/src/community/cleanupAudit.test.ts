import { describe, expect, it } from "vitest";
import {
  buildCommunityCleanupAuditQuery,
  communityMediaCleanupPolicy,
  communityUploadCleanupPolicy
} from "./cleanupAudit";

describe("community cleanup audit contract", () => {
  it("shares the complete worker recovery policy", () => {
    expect(communityUploadCleanupPolicy).toEqual({
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
    });
    expect(communityMediaCleanupPolicy).toEqual({
      retryStatuses: ["cleanup_pending", "published_cleanup_pending"],
      retryAfterMs: 30_000,
      staleStatuses: ["staged", "publishing"],
      staleAfterMs: 2 * 60_000
    });
  });

  it("reports immediate and stale worker-recoverable rows separately without mutations", () => {
    const query = buildCommunityCleanupAuditQuery();

    expect(query).toContain("consumed_at IS NULL");
    expect(query).toContain("expires_at <= now()");
    expect(query).toContain("updated_at <= now() - interval '15 minutes'");
    expect(query).toContain("updated_at <= now() - interval '30 seconds'");
    expect(query).toContain("updated_at <= now() - interval '2 minutes'");
    expect(query).toContain("expired_unconsumed_immediate_manifests");
    expect(query).toContain("expired_unconsumed_stale_work_manifests");
    expect(query).toContain("retryable_media_candidates");
    expect(query).toContain("stale_media_candidates");
    expect(query).toContain("due_object_deletion_jobs");
    expect(query).toContain("pending_message_purge_requests");
    expect(query).toContain("status = 'pending'");
    expect(query).toContain("status = 'claimed'");
    expect(query.match(/LIMIT 1001/g)).toHaveLength(7);
    expect(query).not.toMatch(/\b(?:DELETE|UPDATE|TRUNCATE)\b/i);
  });
});
