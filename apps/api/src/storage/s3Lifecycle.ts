import type { StoredS3Config } from "./s3Config";
import type { LifecycleRule } from "@aws-sdk/client-s3";

export type S3LifecycleRule = LifecycleRule;

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
    if (!overlapsCommunity(filter.prefix)) continue;
    const structuralKeys = new Set(["ID", "Status", "Prefix", "Filter"]);
    const actionKeys = Object.entries(rule)
      .filter(([key, value]) => !structuralKeys.has(key) && value !== undefined)
      .map(([key]) => key);

    const exactExpirationAction = actionKeys.length === 1 && actionKeys[0] === "Expiration";
    const exactMultipartAction = actionKeys.length === 1 && actionKeys[0] === "AbortIncompleteMultipartUpload";
    if (actionKeys.length > 0 && !exactExpirationAction && !exactMultipartAction) {
      errors.push(`unsafe or unsupported community lifecycle action: ${rule.ID ?? "unnamed"}`);
      continue;
    }

    if (rule.Expiration) {
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

    if (rule.AbortIncompleteMultipartUpload) {
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

export async function verifyS3TargetCapabilities(input: {
  target: "primary" | "reserve";
  bucket: string;
  lifecycleRules: S3LifecycleRule[];
  versioning: string;
  probe: () => Promise<{ versions: number; deleteMarkers: number }>;
}) {
  const lifecycle = validateCommunityLifecycleRules(input.lifecycleRules);
  if (!lifecycle.ok) {
    throw new Error(`${input.target} bucket ${input.bucket}: ${lifecycle.errors.join("; ")}`);
  }
  if (input.versioning !== "Enabled") {
    throw new Error(`${input.target} bucket ${input.bucket}: versioning must be Enabled for convergent privacy deletion`);
  }
  const deletionProbe = await input.probe();
  return {
    target: input.target,
    bucket: input.bucket,
    lifecycle: "verified" as const,
    versioning: input.versioning,
    deletion: "all-versions-and-delete-markers" as const,
    deletionProbe
  };
}

export function createS3ConfigurationVerifier<Result>(
  verifyTarget: (target: "primary" | "reserve", config: StoredS3Config) => Promise<Result>
) {
  return async function verifyS3Configuration(config: StoredS3Config) {
    const targets = [await verifyTarget("primary", config)];
    if (config.reserve) {
      targets.push(await verifyTarget("reserve", {
        ...config.reserve,
        signedUrlTtlSeconds: config.signedUrlTtlSeconds,
        reserve: null
      }));
    }
    return targets;
  };
}
