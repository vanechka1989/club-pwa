import { describe, expect, it, vi } from "vitest";
import type { StoredS3Config } from "./s3Config";

vi.mock("../db/client", () => ({ db: {} }));
vi.mock("../env", () => ({ env: {} }));
vi.mock("../logger", () => ({ logger: { warn: vi.fn() } }));
import { createDeleteObjectCompletely, createDeleteObjectCopies } from "./s3";

const primary: StoredS3Config = {
  endpoint: "https://primary.example.com",
  region: "ru1",
  bucket: "primary",
  accessKeyId: "primary-access",
  secretAccessKey: "primary-secret",
  publicBaseUrl: null,
  signedUrlTtlSeconds: 600,
  reserve: null
};

const reserve = {
  endpoint: "https://reserve.example.com",
  region: "ru2",
  bucket: "reserve",
  accessKeyId: "reserve-access",
  secretAccessKey: "reserve-secret",
  publicBaseUrl: null
};

describe("deleteObjectCopies", () => {
  it("enumerates and permanently deletes every version and delete marker", async () => {
    const deleted: Array<{ key: string; versionId: string }> = [];
    let listing = 0;
    const remove = createDeleteObjectCompletely({
      getVersioning: async () => "Enabled",
      listVersions: async () => listing++ === 0
        ? {
            versions: [
              { key: "community/final/private.webp", versionId: "v2" },
              { key: "community/final/private.webp", versionId: "v1" },
              { key: "community/final/private.webp-neighbor", versionId: "other" }
            ],
            deleteMarkers: [{ key: "community/final/private.webp", versionId: "marker" }],
            next: null
          }
        : { versions: [], deleteMarkers: [], next: null },
      deleteVersions: async (_config, objects) => { deleted.push(...objects); },
      deleteCurrent: vi.fn(async () => undefined)
    });

    await remove(primary, "community/final/private.webp");

    expect(deleted).toEqual([
      { key: "community/final/private.webp", versionId: "v2" },
      { key: "community/final/private.webp", versionId: "v1" },
      { key: "community/final/private.webp", versionId: "marker" }
    ]);
  });

  it("fails closed when bucket versioning state is unknown", async () => {
    const remove = createDeleteObjectCompletely({
      getVersioning: async () => "Unknown" as never,
      listVersions: vi.fn(),
      deleteVersions: vi.fn(),
      deleteCurrent: vi.fn()
    });
    await expect(remove(primary, "community/final/private.webp")).rejects.toThrow("Unsupported S3 versioning state");
  });

  it("deletes the primary copy when reserve storage is not configured", async () => {
    const deleteFromConfig = vi.fn(async () => undefined);
    const remove = createDeleteObjectCopies({
      loadConfig: async () => primary,
      deleteFromConfig
    });

    await remove("community/images/message/photo.webp");

    expect(deleteFromConfig).toHaveBeenCalledOnce();
    expect(deleteFromConfig).toHaveBeenCalledWith(primary, "community/images/message/photo.webp");
  });

  it("attempts both configured copies and retries every target after a partial failure", async () => {
    const config: StoredS3Config = { ...primary, reserve };
    let attempt = 0;
    const calls: string[] = [];
    const deleteFromConfig = vi.fn(async (target: StoredS3Config) => {
      calls.push(`${attempt}:${target.bucket}`);
      if (attempt === 0 && target.bucket === "reserve") throw new Error("reserve unavailable");
    });
    const remove = createDeleteObjectCopies({ loadConfig: async () => config, deleteFromConfig });

    await expect(remove("community/images/message/photo.webp")).rejects.toThrow("reserve unavailable");
    attempt += 1;
    await expect(remove("community/images/message/photo.webp")).resolves.toBeUndefined();

    expect(calls).toEqual(["0:primary", "0:reserve", "1:primary", "1:reserve"]);
  });
});
