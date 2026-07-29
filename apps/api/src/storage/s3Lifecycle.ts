export type S3LifecycleRule = {
  ID?: string;
  Status?: string;
  Prefix?: string;
  Filter?: {
    Prefix?: string;
    Tag?: unknown;
    And?: { Prefix?: string; Tags?: unknown[] };
  };
  Expiration?: { Days?: number; Date?: unknown };
  AbortIncompleteMultipartUpload?: { DaysAfterInitiation?: number };
};

type LifecycleValidation = { ok: true; errors: [] } | { ok: false; errors: string[] };

function plainPrefix(rule: S3LifecycleRule) {
  if (rule.Filter?.Tag || rule.Filter?.And?.Tags?.length) return null;
  return rule.Filter?.Prefix ?? rule.Filter?.And?.Prefix ?? rule.Prefix ?? "";
}

function declaredPrefix(rule: S3LifecycleRule) {
  return rule.Filter?.Prefix ?? rule.Filter?.And?.Prefix ?? rule.Prefix ?? "";
}

function isEnabled(rule: S3LifecycleRule) {
  return rule.Status === "Enabled";
}

function hasAbortRule(rules: S3LifecycleRule[]) {
  return rules.some((rule) => {
    const prefix = plainPrefix(rule);
    const days = rule.AbortIncompleteMultipartUpload?.DaysAfterInitiation;
    return isEnabled(rule)
      && prefix !== null
      && "community/pending/".startsWith(prefix)
      && typeof days === "number"
      && days >= 1
      && days <= 1;
  });
}

function hasExactExpiration(rules: S3LifecycleRule[], prefix: string, maximumDays: number) {
  return rules.some((rule) => {
    const days = rule.Expiration?.Days;
    return isEnabled(rule)
      && plainPrefix(rule) === prefix
      && rule.Expiration?.Date === undefined
      && typeof days === "number"
      && days >= 1
      && days <= maximumDays;
  });
}

function hasUnsafeCommunityExpiration(rules: S3LifecycleRule[]) {
  return rules.some((rule) => {
    const expiration = rule.Expiration;
    if (!isEnabled(rule) || (!expiration || (expiration.Days === undefined && expiration.Date === undefined))) {
      return false;
    }

    const prefix = declaredPrefix(rule);
    const overlapsCommunity = prefix === ""
      || prefix.startsWith("community/")
      || "community/".startsWith(prefix);
    if (!overlapsCommunity) return false;

    const days = expiration.Days;
    const exactPrefix = plainPrefix(rule);
    return expiration.Date !== undefined
      || typeof days !== "number"
      || days < 1
      || (exactPrefix === "community/pending/" ? days > 1 : exactPrefix === "community/candidates/" ? days > 7 : true);
  });
}

export function validateCommunityLifecycleRules(rules: S3LifecycleRule[]): LifecycleValidation {
  const errors: string[] = [];
  if (!hasAbortRule(rules)) errors.push("missing one-day multipart abort rule for community uploads");
  if (!hasExactExpiration(rules, "community/pending/", 1)) {
    errors.push("missing exact one-day expiration rule for community/pending/");
  }
  if (!hasExactExpiration(rules, "community/candidates/", 7)) {
    errors.push("missing exact seven-day expiration rule for community/candidates/");
  }
  if (hasUnsafeCommunityExpiration(rules)) {
    errors.push("unsafe or unsupported expiration rule overlaps community objects");
  }
  return errors.length === 0 ? { ok: true, errors: [] } : { ok: false, errors };
}
