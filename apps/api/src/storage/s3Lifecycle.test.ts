import { describe, expect, it } from "vitest";
import { validateCommunityLifecycleRules, type S3LifecycleRule } from "./s3Lifecycle";

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
});
