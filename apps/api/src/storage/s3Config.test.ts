import { describe, expect, it } from "vitest";
import {
  buildS3SettingsResponse,
  getS3ConfigFromSetting,
  normalizeS3PublicBaseUrl,
  storageSettingKey,
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
    signedUrlTtlSeconds: 7200
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
});
