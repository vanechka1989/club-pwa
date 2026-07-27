export type WriteRateLimitPolicy = { scope: "community" | "support"; limit: number; windowMs: number };

export function getWriteRateLimitPolicy(method: string, path: string): WriteRateLimitPolicy | null {
  if (!new Set(["POST", "PUT", "PATCH", "DELETE"]).has(method.toUpperCase())) return null;
  if (path.startsWith("/community/")) return { scope: "community", limit: 60, windowMs: 60_000 };
  if (path.startsWith("/support/")) return { scope: "support", limit: 30, windowMs: 60_000 };
  return null;
}
