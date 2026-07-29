import { communityMediaCleanupPolicy, communityUploadCleanupPolicy } from "./cleanupPolicy";

export { communityMediaCleanupPolicy, communityUploadCleanupPolicy } from "./cleanupPolicy";

function sqlStatuses(statuses: readonly string[]) {
  return statuses.map((status) => `'${status}'`).join(",");
}

export function buildCommunityCleanupAuditQuery() {
  return `
    SELECT
      (SELECT count(*)::int FROM (
        SELECT 1 FROM community_upload_manifests
          WHERE consumed_at IS NULL AND expires_at <= now()
            AND status IN (${sqlStatuses(communityUploadCleanupPolicy.immediatelyReclaimableStatuses)})
          LIMIT 1001
      ) AS bounded_immediate_manifests) AS expired_unconsumed_immediate_manifests,
      (SELECT count(*)::int FROM (
        SELECT 1 FROM community_upload_manifests
          WHERE consumed_at IS NULL AND expires_at <= now()
            AND status IN (${sqlStatuses(communityUploadCleanupPolicy.staleStatuses)})
            AND updated_at <= now() - interval '15 minutes'
          LIMIT 1001
      ) AS bounded_stale_manifests) AS expired_unconsumed_stale_work_manifests,
      (SELECT count(*)::int FROM (
        SELECT 1 FROM community_media_candidates
          WHERE status IN (${sqlStatuses(communityMediaCleanupPolicy.retryStatuses)})
            AND updated_at <= now() - interval '30 seconds'
          LIMIT 1001
      ) AS bounded_retryable_candidates) AS retryable_media_candidates,
      (SELECT count(*)::int FROM (
        SELECT 1 FROM community_media_candidates
          WHERE status IN (${sqlStatuses(communityMediaCleanupPolicy.staleStatuses)})
            AND updated_at <= now() - interval '2 minutes'
          LIMIT 1001
      ) AS bounded_stale_candidates) AS stale_media_candidates,
      (SELECT count(*)::int FROM (
        SELECT 1 FROM club_message_attachments
          WHERE scan_status IN ('pending','scanning','failed')
          LIMIT 1001
      ) AS bounded_documents) AS quarantined_documents,
      (SELECT count(*)::int FROM (
        SELECT 1 FROM community_object_deletion_jobs
          WHERE not_before <= now()
            AND (
              status = 'pending'
              OR (status = 'claimed' AND claimed_at <= now() - interval '15 minutes')
            )
          LIMIT 1001
      ) AS bounded_object_deletions) AS due_object_deletion_jobs,
      (SELECT count(*)::int FROM (
        SELECT 1 FROM community_message_purge_requests
          LIMIT 1001
      ) AS bounded_purge_requests) AS pending_message_purge_requests
  `;
}
