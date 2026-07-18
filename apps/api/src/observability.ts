import { timingSafeEqual } from "node:crypto";

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function hasObservabilityAccess(request: Request, configuredToken?: string) {
  if (!configuredToken) return false;
  const authorization = request.headers.get("authorization") ?? "";
  const bearerToken = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const headerToken = request.headers.get("x-observability-token")?.trim() ?? "";
  const candidate = bearerToken || headerToken;
  return candidate.length > 0 && safeEqual(candidate, configuredToken);
}
