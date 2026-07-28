import { describe, expect, it, vi } from "vitest";
import type { StoredS3Config } from "./s3Config";

vi.mock("../db/client", () => ({ db: {} }));
vi.mock("../env", () => ({ env: {} }));
vi.mock("../logger", () => ({ logger: { warn: vi.fn() } }));
import { createDeleteObjectCopies } from "./s3";

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
