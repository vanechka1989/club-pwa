import { postgresClient } from "../db/client";
import { buildCommunityCleanupAuditQuery } from "../community/cleanupAudit";

try {
  const rows = await postgresClient.unsafe(buildCommunityCleanupAuditQuery());
  const summary = rows[0];
  if (!summary) throw new Error("Community cleanup dry-run returned no summary");
  console.log(JSON.stringify({ ok: true, dryRun: true, deletesPerformed: 0, ...summary }));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await postgresClient.end({ timeout: 5 });
}
