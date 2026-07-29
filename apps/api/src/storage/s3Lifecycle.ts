export type S3LifecycleRule = {
  ID?: string;
  Status?: string;
  Prefix?: string;
  Filter?: {
    Prefix?: string;
    Tag?: unknown;
    ObjectSizeGreaterThan?: number;
    ObjectSizeLessThan?: number;
    And?: {
      Prefix?: string;
      Tags?: unknown[];
      ObjectSizeGreaterThan?: number;
      ObjectSizeLessThan?: number;
    };
  };
  Expiration?: { Days?: number; Date?: unknown };
  AbortIncompleteMultipartUpload?: { DaysAfterInitiation?: number };
};

type LifecycleValidation = { ok: true; errors: [] } | { ok: false; errors: string[] };

type NormalizedFilter = {
  prefix: string;
  unconditional: boolean;
};

function normalizeFilter(rule: S3LifecycleRule): NormalizedFilter {
  if (rule.Filter) {
    const populatedKeys = Object.entries(rule.Filter)
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key);
    return {
      prefix: rule.Filter.Prefix ?? rule.Filter.And?.Prefix ?? "",
      unconditional: populatedKeys.length === 1
        && populatedKeys[0] === "Prefix"
        && typeof rule.Filter.Prefix === "string"
    };
  }
  return {
    prefix: rule.Prefix ?? "",
    unconditional: typeof rule.Prefix === "string"
  };
}

function overlapsCommunity(prefix: string) {
  return prefix === "" || prefix.startsWith("community/") || "community/".startsWith(prefix);
}

export function validateCommunityLifecycleRules(rules: S3LifecycleRule[]): LifecycleValidation {
  const errors: string[] = [];
  let pendingExpirationCount = 0;
  let candidateExpirationCount = 0;
  let multipartAbortCount = 0;

  for (const rule of rules) {
    if (rule.Status !== "Enabled") continue;
    const filter = normalizeFilter(rule);

    if (rule.Expiration && overlapsCommunity(filter.prefix)) {
      const days = rule.Expiration.Days;
      const hasDate = rule.Expiration.Date !== undefined;
      if (filter.unconditional && !hasDate && days === 1 && filter.prefix === "community/pending/") {
        pendingExpirationCount += 1;
      } else if (filter.unconditional && !hasDate && days === 7 && filter.prefix === "community/candidates/") {
        candidateExpirationCount += 1;
      } else {
        errors.push(`unsafe or unsupported community expiration rule: ${rule.ID ?? "unnamed"}`);
      }
    }

    if (rule.AbortIncompleteMultipartUpload && overlapsCommunity(filter.prefix)) {
      if (filter.unconditional
        && filter.prefix === "community/"
        && rule.AbortIncompleteMultipartUpload.DaysAfterInitiation === 1) {
        multipartAbortCount += 1;
      } else {
        errors.push(`unsafe or unsupported community multipart rule: ${rule.ID ?? "unnamed"}`);
      }
    }
  }

  if (pendingExpirationCount !== 1) {
    errors.push("expected exactly one unconditional one-day expiration rule for community/pending/");
  }
  if (candidateExpirationCount !== 1) {
    errors.push("expected exactly one unconditional seven-day expiration rule for community/candidates/");
  }
  if (multipartAbortCount !== 1) {
    errors.push("expected exactly one unconditional one-day multipart abort rule for community/");
  }

  return errors.length === 0 ? { ok: true, errors: [] } : { ok: false, errors };
}
