import type { AdminStorageMaintenance } from "@club/shared";
import { readFile } from "node:fs/promises";

const allowedKeys = new Set([
  "STATUS",
  "COMPLETED_AT",
  "MODE",
  "DISK_BEFORE_PERCENT",
  "DISK_AFTER_PERCENT",
  "DISK_TOTAL_BYTES",
  "DISK_FREE_BYTES",
  "RECLAIMED_BYTES",
  "DOCKER_IMAGES_SIZE",
  "DOCKER_BUILD_CACHE_SIZE",
  "SYSTEM_LOG_BYTES",
  "APP_BYTES",
  "ERROR_CODE"
]);

function parseInteger(value: string | undefined, maximum = Number.MAX_SAFE_INTEGER) {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= maximum ? parsed : null;
}

function parseSizeLabel(value: string | undefined) {
  return value && value.length <= 24 && /^\d+(?:\.\d+)?(?:[KMGTPE]?B)$/i.test(value) ? value : null;
}

export function parseHostMaintenanceStatus(source: string): AdminStorageMaintenance | null {
  const values = new Map<string, string>();
  for (const line of source.split(/\r?\n/)) {
    if (!line) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) return null;
    const key = line.slice(0, separator);
    if (!allowedKeys.has(key) || values.has(key)) return null;
    values.set(key, line.slice(separator + 1));
  }

  const status = values.get("STATUS");
  const mode = values.get("MODE");
  const completedAt = new Date(values.get("COMPLETED_AT") ?? "");
  const diskBeforePercent = parseInteger(values.get("DISK_BEFORE_PERCENT"), 100);
  const diskAfterPercent = parseInteger(values.get("DISK_AFTER_PERCENT"), 100);
  const diskTotalBytes = parseInteger(values.get("DISK_TOTAL_BYTES"));
  const diskFreeBytes = parseInteger(values.get("DISK_FREE_BYTES"));
  const reclaimedBytes = parseInteger(values.get("RECLAIMED_BYTES"));
  const dockerImagesSize = parseSizeLabel(values.get("DOCKER_IMAGES_SIZE"));
  const dockerBuildCacheSize = parseSizeLabel(values.get("DOCKER_BUILD_CACHE_SIZE"));
  const systemLogBytes = parseInteger(values.get("SYSTEM_LOG_BYTES"));
  const appBytes = parseInteger(values.get("APP_BYTES"));
  const errorCodeValue = values.get("ERROR_CODE") ?? "";

  if (
    (status !== "success" && status !== "failure")
    || (mode !== "routine" && mode !== "pressure")
    || Number.isNaN(completedAt.getTime())
    || diskBeforePercent === null
    || diskAfterPercent === null
    || diskTotalBytes === null
    || diskFreeBytes === null
    || reclaimedBytes === null
    || dockerImagesSize === null
    || dockerBuildCacheSize === null
    || systemLogBytes === null
    || appBytes === null
    || !/^[a-z0-9-]{0,64}$/.test(errorCodeValue)
  ) return null;

  return {
    status,
    completedAt: completedAt.toISOString(),
    mode,
    diskBeforePercent,
    diskAfterPercent,
    diskTotalBytes,
    diskFreeBytes,
    reclaimedBytes,
    dockerImagesSize,
    dockerBuildCacheSize,
    systemLogBytes,
    appBytes,
    errorCode: errorCodeValue || null
  };
}

export async function readHostMaintenanceStatus(path = "/app/host-maintenance/storage.env") {
  try {
    return parseHostMaintenanceStatus(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}
