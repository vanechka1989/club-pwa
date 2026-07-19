import { randomUUID } from "node:crypto";
import type { AdminServerErrorLog } from "@club/shared";
import { count, desc, lt } from "drizzle-orm";
import { db } from "./db/client";
import { serverErrorLogs } from "./db/schema";
import { logger } from "./logger";

const maxServerErrors = 100;
const serverErrors: AdminServerErrorLog[] = [];
const retentionMs = 30 * 24 * 60 * 60 * 1000;
let lastPrunedAt = 0;

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  return "Неизвестная ошибка сервера.";
}

export function recordServerError(input: {
  error: unknown;
  title?: string;
  path?: string | null;
  method?: string | null;
  status?: number | null;
}) {
  const log: AdminServerErrorLog = {
    id: randomUUID(),
    title: input.title?.trim() || "Ошибка сервера",
    detail: errorMessage(input.error),
    path: input.path ?? null,
    method: input.method ?? null,
    status: input.status ?? null,
    createdAt: new Date().toISOString()
  };

  serverErrors.unshift(log);
  serverErrors.splice(maxServerErrors);
  void persistServerError(log);
  return log;
}

async function persistServerError(log: AdminServerErrorLog) {
  try {
    await db.insert(serverErrorLogs).values({
      id: log.id,
      title: log.title,
      detail: log.detail,
      path: log.path,
      method: log.method,
      status: log.status,
      createdAt: new Date(log.createdAt)
    });
    const now = Date.now();
    if (now - lastPrunedAt > 60 * 60 * 1000) {
      lastPrunedAt = now;
      await db.delete(serverErrorLogs).where(lt(serverErrorLogs.createdAt, new Date(now - retentionMs)));
    }
  } catch (error) {
    logger.warn({ error }, "Unable to persist server error log");
  }
}

export async function listServerErrors() {
  try {
    const rows = await db.select().from(serverErrorLogs).orderBy(desc(serverErrorLogs.createdAt)).limit(maxServerErrors);
    return rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString()
    }));
  } catch (error) {
    logger.warn({ error }, "Unable to read persisted server errors");
    return [...serverErrors];
  }
}

export async function countServerErrors() {
  try {
    const [result] = await db.select({ value: count() }).from(serverErrorLogs);
    return result?.value ?? 0;
  } catch (error) {
    logger.warn({ error }, "Unable to count persisted server errors");
    return serverErrors.length;
  }
}
