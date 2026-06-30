import type { Context } from "hono";
import type { AuthVariables } from "../middleware/auth";

const secretMetadataKeyPattern = /(secret|token|password|credential|accesskey|privatekey|apikey)/i;

export function sanitizeAdminActionMetadata(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeAdminActionMetadata(entry));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      secretMetadataKeyPattern.test(key) ? "[redacted]" : sanitizeAdminActionMetadata(entry)
    ])
  );
}

export async function recordAdminAction(
  c: Context<{ Variables: AuthVariables }>,
  input: {
    action: string;
    entityType: string;
    entityId?: string | null;
    targetUserId?: string | null;
    targetTelegramId?: string | null;
    summary: string;
    metadata?: Record<string, unknown>;
  }
) {
  const [{ db }, { adminActionLogs }] = await Promise.all([import("../db/client"), import("../db/schema")]);

  await db.insert(adminActionLogs).values({
    actorUserId: c.get("userId"),
    actorTelegramId: c.get("telegramUser").id,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    targetUserId: input.targetUserId ?? null,
    targetTelegramId: input.targetTelegramId ?? null,
    summary: input.summary,
    metadata: sanitizeAdminActionMetadata(input.metadata ?? {}) as Record<string, unknown>
  });
}
