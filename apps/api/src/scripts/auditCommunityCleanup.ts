import { postgresClient } from "../db/client";

const cleanupDryRunQuery = `
  SELECT
    (SELECT count(*)::int FROM (
      SELECT 1 FROM community_upload_manifests
        WHERE attachment_id IS NULL AND expires_at <= now()
          AND status IN ('uploading','aborting','pending','ready','failed','cleanup_pending','rejected')
        LIMIT 1001
    ) AS bounded_expired_manifests) AS expired_unattached_manifests,
    (SELECT count(*)::int FROM (
      SELECT 1 FROM community_media_candidates
        WHERE status IN ('cleanup_pending','published_cleanup_pending')
        LIMIT 1001
    ) AS bounded_media_candidates) AS retryable_media_candidates,
    (SELECT count(*)::int FROM (
      SELECT 1 FROM club_message_attachments
        WHERE scan_status IN ('pending','scanning','failed')
        LIMIT 1001
    ) AS bounded_documents) AS quarantined_documents
`;

try {
  const rows = await postgresClient.unsafe(cleanupDryRunQuery);
  const summary = rows[0];
  if (!summary) throw new Error("Community cleanup dry-run returned no summary");
  console.log(JSON.stringify({ ok: true, dryRun: true, deletesPerformed: 0, ...summary }));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await postgresClient.end({ timeout: 5 });
}
