import { describe, expect, it, vi } from "vitest";
import {
  createS3ConfigurationVerifier,
  validateCommunityLifecycleRules,
  verifyS3TargetCapabilities,
  type S3LifecycleRule
} from "./s3Lifecycle";
import type { StoredS3Config } from "./s3Config";

describe("community S3 lifecycle release gate", () => {
  const validRules: S3LifecycleRule[] = [
    {
      ID: "abort-community-multipart",
      Status: "Enabled",
      Filter: { Prefix: "community/" },
      AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 }
    },
    {
      ID: "expire-community-pending",
      Status: "Enabled",
      Filter: { Prefix: "community/pending/" },
      Expiration: { Days: 1 }
    },
    {
      ID: "expire-community-candidates",
      Status: "Enabled",
      Filter: { Prefix: "community/candidates/" },
      Expiration: { Days: 7 }
    }
  ];

  it("accepts bounded cleanup rules without putting published objects at risk", () => {
    expect(validateCommunityLifecycleRules(validRules)).toEqual({ ok: true, errors: [] });
  });

  it("requires exact one-day pending and seven-day candidate expiration", () => {
    expect(validateCommunityLifecycleRules(validRules.slice(1))).toMatchObject({ ok: false });
    expect(validateCommunityLifecycleRules(validRules.map((rule) =>
      rule.ID === "expire-community-pending" ? { ...rule, Status: "Disabled" } : rule
    ))).toMatchObject({ ok: false });
    for (const days of [1, 6, 8]) {
      expect(validateCommunityLifecycleRules(validRules.map((rule) =>
        rule.ID === "expire-community-candidates"
          ? { ...rule, Expiration: { Days: days } }
          : rule
      )), `candidate expiration ${days}d`).toMatchObject({ ok: false });
    }
    for (const days of [0, 2]) {
      expect(validateCommunityLifecycleRules(validRules.map((rule) =>
        rule.ID === "expire-community-pending"
          ? { ...rule, Expiration: { Days: days } }
          : rule
      )), `pending expiration ${days}d`).toMatchObject({ ok: false });
    }
  });

  it("rejects duplicate, additional and conditional community expiration rules", () => {
    expect(validateCommunityLifecycleRules(validRules.map((rule) =>
      rule.ID === "expire-community-pending"
        ? { ...rule, Filter: { Prefix: "community/" } }
        : rule
    ))).toMatchObject({ ok: false });
    expect(validateCommunityLifecycleRules([
      ...validRules,
      {
        ID: "dangerous-community-expiration",
        Status: "Enabled",
        Filter: { Prefix: "community/" },
        Expiration: { Days: 30 }
      }
    ])).toMatchObject({ ok: false });
    expect(validateCommunityLifecycleRules([
      ...validRules,
      { ...validRules[2]!, ID: "duplicate-candidate-expiration" }
    ])).toMatchObject({ ok: false });
    expect(validateCommunityLifecycleRules([
      ...validRules,
      { ...validRules[1]!, ID: "duplicate-pending-expiration" }
    ])).toMatchObject({ ok: false });
    expect(validateCommunityLifecycleRules([
      ...validRules,
      {
        ID: "additional-two-day-candidate-expiration",
        Status: "Enabled",
        Filter: { Prefix: "community/candidates/" },
        Expiration: { Days: 2 }
      }
    ])).toMatchObject({ ok: false });
    expect(validateCommunityLifecycleRules([
      ...validRules,
      {
        ID: "unsupported-tagged-community-expiration",
        Status: "Enabled",
        Filter: { And: { Prefix: "community/", Tags: [{ Key: "temporary", Value: "true" }] } },
        Expiration: { Days: 30 }
      }
    ])).toMatchObject({ ok: false });
    expect(validateCommunityLifecycleRules(validRules.map((rule) =>
      rule.ID === "expire-community-candidates"
        ? {
            ...rule,
            Filter: {
              And: {
                Prefix: "community/candidates/",
                ObjectSizeGreaterThan: 1024
              }
            }
          } as unknown as S3LifecycleRule
        : rule
    ))).toMatchObject({ ok: false });
    expect(validateCommunityLifecycleRules(validRules.map((rule) =>
      rule.ID === "expire-community-pending"
        ? { ...rule, Expiration: { Date: new Date("2099-01-01T00:00:00.000Z") } }
        : rule
    ))).toMatchObject({ ok: false });
  });

  it.each([
    ["current-version transition", { Transitions: [{ Days: 1, StorageClass: "GLACIER" }] }],
    ["noncurrent transition", { NoncurrentVersionTransitions: [{ NoncurrentDays: 1, StorageClass: "GLACIER" }] }],
    ["noncurrent expiration", { NoncurrentVersionExpiration: { NoncurrentDays: 1 } }],
    ["expired delete markers", { Expiration: { ExpiredObjectDeleteMarker: true } }]
  ])("rejects an enabled community-overlapping %s action", (_name, action) => {
    expect(validateCommunityLifecycleRules([
      ...validRules,
      {
        ID: "unsafe-extra-action",
        Status: "Enabled",
        Filter: { Prefix: "community/final/" },
        ...action as Partial<S3LifecycleRule>
      }
    ])).toMatchObject({ ok: false });
  });

  it("rejects a required allowlisted action when the same rule contains any extra action", () => {
    expect(validateCommunityLifecycleRules(validRules.map((rule) =>
      rule.ID === "expire-community-pending"
        ? {
            ...rule,
            Transitions: [{ Days: 2, StorageClass: "STANDARD_IA" as const }]
          }
        : rule
    ))).toMatchObject({ ok: false });
  });

  it("fails closed for an enabled overlapping action unknown to the current SDK", () => {
    expect(validateCommunityLifecycleRules([
      ...validRules,
      {
        ID: "future-action",
        Status: "Enabled",
        Filter: { Prefix: "community/final/" },
        FutureLifecycleAction: { Days: 1 }
      } as unknown as S3LifecycleRule
    ])).toMatchObject({ ok: false });
  });

  it("allows disabled additional community rules because they cannot affect stored objects", () => {
    expect(validateCommunityLifecycleRules([
      ...validRules,
      {
        ID: "disabled-future-policy",
        Status: "Disabled",
        Filter: { Prefix: "community/final/" },
        Transitions: [{ Days: 1, StorageClass: "GLACIER" }],
        NoncurrentVersionExpiration: { NoncurrentDays: 1 }
      }
    ])).toEqual({ ok: true, errors: [] });
  });

  it("requires one exact unconditional multipart-abort rule", () => {
    expect(validateCommunityLifecycleRules(validRules.map((rule) =>
      rule.ID === "abort-community-multipart"
        ? { ...rule, AbortIncompleteMultipartUpload: { DaysAfterInitiation: 0 } }
        : rule
    ))).toMatchObject({ ok: false });
    expect(validateCommunityLifecycleRules([
      ...validRules,
      { ...validRules[0]!, ID: "duplicate-multipart-abort" }
    ])).toMatchObject({ ok: false });
    expect(validateCommunityLifecycleRules(validRules.map((rule) =>
      rule.ID === "abort-community-multipart"
        ? { ...rule, Filter: { Tag: { Key: "temporary", Value: "true" } } }
        : rule
    ))).toMatchObject({ ok: false });
  });

  it("uses the same lifecycle, versioning, and all-version IAM gate for a runtime credential rotation", async () => {
    const probe = vi.fn(async () => ({ versions: 2, deleteMarkers: 1 }));

    await expect(verifyS3TargetCapabilities({
      target: "primary",
      bucket: "club-bucket",
      lifecycleRules: validRules,
      versioning: "Enabled",
      probe
    })).resolves.toEqual({
      target: "primary",
      bucket: "club-bucket",
      lifecycle: "verified",
      versioning: "Enabled",
      deletion: "all-versions-and-delete-markers",
      deletionProbe: { versions: 2, deleteMarkers: 1 }
    });
    expect(probe).toHaveBeenCalledOnce();
  });

  it("fails closed before the destructive IAM probe when lifecycle or versioning is unsafe", async () => {
    const probe = vi.fn(async () => ({ versions: 2, deleteMarkers: 1 }));

    await expect(verifyS3TargetCapabilities({
      target: "primary",
      bucket: "club-bucket",
      lifecycleRules: validRules,
      versioning: "Suspended",
      probe
    })).rejects.toThrow("versioning must be Enabled");
    await expect(verifyS3TargetCapabilities({
      target: "reserve",
      bucket: "reserve-bucket",
      lifecycleRules: [],
      versioning: "Enabled",
      probe
    })).rejects.toThrow("expected exactly one");
    expect(probe).not.toHaveBeenCalled();
  });

  it("verifies primary and reserve with the exact candidate credentials", async () => {
    const config: StoredS3Config = {
      endpoint: "https://primary.example.com",
      region: "us-east-1",
      bucket: "primary",
      accessKeyId: "primary-access",
      secretAccessKey: "primary-secret",
      publicBaseUrl: null,
      signedUrlTtlSeconds: 3600,
      reserve: {
        endpoint: "https://reserve.example.com",
        region: "us-east-2",
        bucket: "reserve",
        accessKeyId: "reserve-access",
        secretAccessKey: "reserve-secret",
        publicBaseUrl: null
      }
    };
    const verifyTarget = vi.fn(async (target: "primary" | "reserve", targetConfig: StoredS3Config) => ({
      target,
      bucket: targetConfig.bucket
    }));
    const verify = createS3ConfigurationVerifier(verifyTarget);

    await expect(verify(config)).resolves.toEqual([
      { target: "primary", bucket: "primary" },
      { target: "reserve", bucket: "reserve" }
    ]);
    expect(verifyTarget.mock.calls).toEqual([
      ["primary", config],
      ["reserve", { ...config.reserve, signedUrlTtlSeconds: 3600, reserve: null }]
    ]);
  });
});
