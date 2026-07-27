import { createHash } from "node:crypto";

export type ErrorSource = "client" | "api" | "background-job" | "payment-webhook";
export type ErrorSeverity = "warning" | "error" | "critical";
export type ErrorGroupStatus = "new" | "acknowledged" | "resolved" | "ignored";

export type RawErrorEvent = {
  source: ErrorSource;
  kind: string;
  message: string;
  title?: string | null;
  route?: string | null;
  method?: string | null;
  status?: number | null;
  stack?: string | null;
  detail?: unknown;
  release?: string | null;
  userAgent?: string | null;
  platform?: string | null;
  viewport?: { width?: number | null; height?: number | null } | null;
  displayMode?: string | null;
  online?: boolean | null;
  installationId?: string | null;
  occurredAt?: Date;
};

export type SanitizedErrorEvent = Omit<RawErrorEvent, "detail" | "occurredAt"> & {
  message: string;
  kind: string;
  title: string;
  route: string | null;
  method: string | null;
  stack: string | null;
  detail: unknown;
  release: string | null;
  occurredAt: Date;
};

const secretKeyPattern = /authorization|cookie|password|passcode|secret|token|api[-_]?key|signature|session/i;
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const bearerPattern = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const assignmentSecretPattern = /\b(token|secret|password|signature|api[-_]?key)\s*[=:]\s*[^\s,;&]+/gi;

function sanitizeText(value: unknown, maxLength: number) {
  return String(value ?? "")
    .replace(bearerPattern, "Bearer [REDACTED]")
    .replace(assignmentSecretPattern, "$1=[REDACTED]")
    .replace(emailPattern, "[EMAIL]")
    .slice(0, maxLength);
}

function sanitizeRoute(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw, "https://club.invalid");
    return sanitizeText(parsed.pathname, 512) || "/";
  } catch {
    return sanitizeText(raw.split(/[?#]/, 1)[0], 512) || null;
  }
}

function sanitizeDetail(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return null;
  if (depth >= 4) return "[TRUNCATED]";
  if (typeof value === "string") return sanitizeText(value, 1000);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeDetail(item, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 30)
        .map(([key, item]) => [key.slice(0, 80), secretKeyPattern.test(key) ? "[REDACTED]" : sanitizeDetail(item, depth + 1)])
    );
  }
  return sanitizeText(value, 1000);
}

export function sanitizeErrorEvent(input: RawErrorEvent): SanitizedErrorEvent {
  const kind = sanitizeText(input.kind, 80).trim() || "unknown-error";
  const message = sanitizeText(input.message, 1000).trim() || "Неизвестная ошибка";
  return {
    ...input,
    source: input.source,
    kind,
    message,
    title: sanitizeText(input.title, 180).trim() || message.slice(0, 180),
    route: sanitizeRoute(input.route),
    method: input.method ? sanitizeText(input.method, 16).toUpperCase() : null,
    status: Number.isInteger(input.status) ? input.status ?? null : null,
    stack: input.stack ? sanitizeText(input.stack, 4000) : null,
    detail: sanitizeDetail(input.detail),
    release: input.release ? sanitizeText(input.release, 64) : null,
    userAgent: input.userAgent ? sanitizeText(input.userAgent, 500) : null,
    platform: input.platform ? sanitizeText(input.platform, 120) : null,
    displayMode: input.displayMode ? sanitizeText(input.displayMode, 32) : null,
    installationId: input.installationId ? sanitizeText(input.installationId, 64) : null,
    occurredAt: input.occurredAt ?? new Date()
  };
}

function normalizeFingerprintPart(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, ":uuid")
    .replace(/\b\d+(?:\.\d+)?\b/g, ":n")
    .replace(/:\d+:\d+/g, ":line:column")
    .replace(/\s+/g, " ")
    .trim();
}

export function fingerprintErrorEvent(event: SanitizedErrorEvent) {
  const relevantStack = event.stack?.split("\n").slice(0, 3).join("\n") ?? "";
  return createHash("sha256")
    .update([event.source, event.kind, normalizeFingerprintPart(event.message), normalizeFingerprintPart(event.route), normalizeFingerprintPart(relevantStack)].join("|"))
    .digest("hex");
}

export function classifyErrorSeverity(event: SanitizedErrorEvent): ErrorSeverity {
  const sensitive = `${event.kind} ${event.route ?? ""}`.toLowerCase();
  if (/blank-screen|startup|boot|payment|payments|webhook|auth/.test(sensitive) || (event.status ?? 0) >= 500 && /pay|auth/.test(sensitive)) {
    return "critical";
  }
  if (/recoverable|warning|retry/.test(sensitive) || (event.status ?? 0) < 500 && event.source !== "api") return "warning";
  return "error";
}

export function shouldNotifyIncident(input: {
  severity: ErrorSeverity;
  count: number;
  affectedUsers: number;
  now: Date;
  lastNotifiedAt: Date | null;
  previousSeverity?: ErrorSeverity | null;
}) {
  const severityRank = { warning: 1, error: 2, critical: 3 } as const;
  const escalated = input.previousSeverity ? severityRank[input.severity] > severityRank[input.previousSeverity] : false;
  if (input.lastNotifiedAt && !escalated && input.now.getTime() - input.lastNotifiedAt.getTime() < 30 * 60_000) return false;
  return input.severity === "critical" || input.count >= 3 || input.affectedUsers >= 2;
}
