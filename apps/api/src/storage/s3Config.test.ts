import { describe, expect, it, vi } from "vitest";
import {
  buildS3SettingsResponse,
  getS3ConfigFromSetting,
  isSameS3PhysicalGeneration,
  normalizeS3PublicBaseUrl,
  storageSettingKey,
  verifyS3LiveConfigurationUpdate,
  type StoredS3Config
} from "./s3Config";

describe("S3 storage config", () => {
  const storedConfig: StoredS3Config = {
    endpoint: "https://s3.ru1.storage.beget.cloud",
    region: "ru1",
    bucket: "club-bucket",
    accessKeyId: "ACCESS123",
    secretAccessKey: "SECRET123",
    publicBaseUrl: "https://cdn.example.com/club",
    signedUrlTtlSeconds: 7200,
    reserve: null
  };

  it("uses a single club settings key", () => {
    expect(storageSettingKey).toBe("s3_storage_config");
  });

  it("parses stored settings and trims public url slash", () => {
    const config = getS3ConfigFromSetting(JSON.stringify({ ...storedConfig, publicBaseUrl: "https://cdn.example.com/club/" }));

    expect(config).toEqual({ ...storedConfig, publicBaseUrl: "https://cdn.example.com/club" });
  });

  it("does not expose access or secret keys in admin response", () => {
    const response = buildS3SettingsResponse({
      config: storedConfig,
      source: "database",
      updatedAt: new Date("2026-06-26T08:30:00.000Z")
    });

    expect(response).toMatchObject({
      configured: true,
      source: "database",
      endpoint: storedConfig.endpoint,
      bucket: storedConfig.bucket,
      region: storedConfig.region,
      publicBaseUrl: storedConfig.publicBaseUrl,
      signedUrlTtlSeconds: storedConfig.signedUrlTtlSeconds,
      accessKeyConfigured: true,
      secretKeyConfigured: true,
      updatedAt: "2026-06-26T08:30:00.000Z"
    });
    expect(JSON.stringify(response)).not.toContain("ACCESS123");
    expect(JSON.stringify(response)).not.toContain("SECRET123");
  });

  it("normalizes empty public url to null", () => {
    expect(normalizeS3PublicBaseUrl("")).toBeNull();
    expect(normalizeS3PublicBaseUrl(" https://cdn.example.com/path/ ")).toBe("https://cdn.example.com/path");
  });

  it("parses optional reserve settings without exposing reserve keys", () => {
    const config = getS3ConfigFromSetting(
      JSON.stringify({
        ...storedConfig,
        reserve: {
          endpoint: "https://reserve-s3.example.com",
          region: "ru2",
          bucket: "club-reserve",
          accessKeyId: "RESERVE_ACCESS",
          secretAccessKey: "RESERVE_SECRET",
          publicBaseUrl: "https://reserve-cdn.example.com/"
        }
      })
    );

    expect(config?.reserve).toMatchObject({
      endpoint: "https://reserve-s3.example.com",
      region: "ru2",
      bucket: "club-reserve",
      publicBaseUrl: "https://reserve-cdn.example.com"
    });

    const response = buildS3SettingsResponse({
      config,
      source: "database",
      updatedAt: new Date("2026-06-26T08:30:00.000Z")
    });

    expect(response.reserveConfigured).toBe(true);
    expect(response.reserveEndpoint).toBe("https://reserve-s3.example.com");
    expect(response.reserveBucket).toBe("club-reserve");
    expect(response.reserveAccessKeyConfigured).toBe(true);
    expect(response.reserveSecretKeyConfigured).toBe(true);
    expect(JSON.stringify(response)).not.toContain("RESERVE_ACCESS");
    expect(JSON.stringify(response)).not.toContain("RESERVE_SECRET");
  });

  it("allows live credential and presentation rotation only inside the same physical generation", () => {
    const nextConfig: StoredS3Config = {
      ...storedConfig,
      endpoint: "https://S3.ru1.storage.beget.cloud/",
      accessKeyId: "ROTATED_ACCESS",
      secretAccessKey: "ROTATED_SECRET",
      publicBaseUrl: "https://new-cdn.example.com/club",
      signedUrlTtlSeconds: 1800
    };

    expect(isSameS3PhysicalGeneration(storedConfig, nextConfig)).toBe(true);
  });

  it.each([
    ["endpoint", { endpoint: "https://new-s3.example.com" }],
    ["bucket", { bucket: "new-club-bucket" }],
    ["region", { region: "ru2" }]
  ] as const)("rejects a live primary %s change", (_field, change) => {
    expect(isSameS3PhysicalGeneration(storedConfig, { ...storedConfig, ...change })).toBe(false);
  });

  it("rejects adding, removing, or moving the reserve target live", () => {
    const reserve = {
      endpoint: "https://reserve-s3.example.com",
      region: "ru2",
      bucket: "club-reserve",
      accessKeyId: "RESERVE_ACCESS",
      secretAccessKey: "RESERVE_SECRET",
      publicBaseUrl: null
    };
    const withReserve = { ...storedConfig, reserve };

    expect(isSameS3PhysicalGeneration(storedConfig, withReserve)).toBe(false);
    expect(isSameS3PhysicalGeneration(withReserve, storedConfig)).toBe(false);
    expect(isSameS3PhysicalGeneration(withReserve, {
      ...withReserve,
      reserve: { ...reserve, bucket: "moved-reserve" }
    })).toBe(false);
    expect(isSameS3PhysicalGeneration(withReserve, {
      ...withReserve,
      reserve: { ...reserve, accessKeyId: "ROTATED", secretAccessKey: "ROTATED_SECRET" }
    })).toBe(true);
  });

  it("runs the full verifier for initial setup and same-generation credential rotation", async () => {
    const verify = vi.fn(async () => undefined);
    const rotated = { ...storedConfig, accessKeyId: "ROTATED", secretAccessKey: "ROTATED_SECRET" };

    await expect(verifyS3LiveConfigurationUpdate(null, storedConfig, verify)).resolves.toBeUndefined();
    await expect(verifyS3LiveConfigurationUpdate(storedConfig, rotated, verify)).resolves.toBeUndefined();
    expect(verify.mock.calls).toEqual([[storedConfig], [rotated]]);
  });

  it("fails closed before probing or persisting a physical-generation switch", async () => {
    const verify = vi.fn(async () => undefined);

    await expect(verifyS3LiveConfigurationUpdate(
      storedConfig,
      { ...storedConfig, bucket: "moved-bucket" },
      verify
    )).rejects.toThrow("s3_physical_generation_change_requires_offline_migration");
    expect(verify).not.toHaveBeenCalled();
  });
});
