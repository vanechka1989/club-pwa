import { describe, expect, it } from "vitest";
import { parseHostMaintenanceStatus, readHostMaintenanceStatus } from "./hostMaintenanceStatus";

const validStatus = `STATUS=success
COMPLETED_AT=2026-07-22T11:20:00Z
MODE=pressure
DISK_BEFORE_PERCENT=72
DISK_AFTER_PERCENT=64
DISK_TOTAL_BYTES=21474836480
DISK_FREE_BYTES=7516192768
RECLAIMED_BYTES=1717986918
DOCKER_IMAGES_SIZE=6.8GB
DOCKER_BUILD_CACHE_SIZE=1.9GB
SYSTEM_LOG_BYTES=157286400
APP_BYTES=83886080
ERROR_CODE=
`;

describe("host storage maintenance status", () => {
  it("parses the allowlisted successful maintenance metrics", () => {
    expect(parseHostMaintenanceStatus(validStatus)).toEqual({
      status: "success",
      completedAt: "2026-07-22T11:20:00.000Z",
      mode: "pressure",
      diskBeforePercent: 72,
      diskAfterPercent: 64,
      diskTotalBytes: 21474836480,
      diskFreeBytes: 7516192768,
      reclaimedBytes: 1717986918,
      dockerImagesSize: "6.8GB",
      dockerBuildCacheSize: "1.9GB",
      systemLogBytes: 157286400,
      appBytes: 83886080,
      errorCode: null
    });
  });

  it("keeps a bounded public error code for failed runs", () => {
    expect(parseHostMaintenanceStatus(validStatus.replace("STATUS=success", "STATUS=failure").replace("ERROR_CODE=", "ERROR_CODE=maintenance-command-failed"))?.errorCode)
      .toBe("maintenance-command-failed");
  });

  it.each([
    validStatus.replace("DISK_AFTER_PERCENT=64", "DISK_AFTER_PERCENT=101"),
    validStatus.replace("RECLAIMED_BYTES=1717986918", "RECLAIMED_BYTES=-1"),
    validStatus.replace("DISK_TOTAL_BYTES=21474836480", "DISK_TOTAL_BYTES=999999999999999999999"),
    validStatus.replace("DOCKER_IMAGES_SIZE=6.8GB", "DOCKER_IMAGES_SIZE=<script>"),
    validStatus.replace("COMPLETED_AT=2026-07-22T11:20:00Z", "COMPLETED_AT=not-a-date")
  ])("rejects malformed or unbounded status data", (source) => {
    expect(parseHostMaintenanceStatus(source)).toBeNull();
  });

  it("returns null when the host has not produced a status file", async () => {
    await expect(readHostMaintenanceStatus("Z:/missing-club-pwa-storage.env")).resolves.toBeNull();
  });
});
