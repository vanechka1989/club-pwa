import { randomUUID } from "node:crypto";
import type { AdminServerErrorLog } from "@club/shared";

const maxServerErrors = 100;
const serverErrors: AdminServerErrorLog[] = [];

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
  return log;
}

export function listServerErrors() {
  return [...serverErrors];
}
