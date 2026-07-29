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

  it("fails closed when a required rule is absent, disabled, too slow or too broad", () => {
    expect(validateCommunityLifecycleRules(validRules.slice(1))).toMatchObject({ ok: false });
    expect(validateCommunityLifecycleRules(validRules.map((rule) =>
      rule.ID === "expire-community-pending" ? { ...rule, Status: "Disabled" } : rule
    ))).toMatchObject({ ok: false });
    expect(validateCommunityLifecycleRules(validRules.map((rule) =>
      rule.ID === "expire-community-candidates"
        ? { ...rule, Expiration: { Days: 8 } }
        : rule
    ))).toMatchObject({ ok: false });
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
      {
        ID: "unsupported-tagged-community-expiration",
        Status: "Enabled",
        Filter: { And: { Prefix: "community/", Tags: [{ Key: "temporary", Value: "true" }] } },
        Expiration: { Days: 30 }
      }
    ])).toMatchObject({ ok: false });
    expect(validateCommunityLifecycleRules(validRules.map((rule) =>
      rule.ID === "abort-community-multipart"
        ? { ...rule, AbortIncompleteMultipartUpload: { DaysAfterInitiation: 0 } }
        : rule
    ))).toMatchObject({ ok: false });
    expect(validateCommunityLifecycleRules(validRules.map((rule) =>
      rule.ID === "expire-community-pending"
        ? { ...rule, Expiration: { Days: 0 } }
        : rule
    ))).toMatchObject({ ok: false });
  });
});
