import type { StoredErrorGroup } from "./store";

const severityLabels = { warning: "Внимание", error: "Ошибка", critical: "Критично" } as const;
const statusLabels = { new: "Новая", acknowledged: "В работе", resolved: "Решена", ignored: "Игнорируется" } as const;
const sourceLabels = { client: "Клиент", api: "API", "background-job": "Фоновая задача", "payment-webhook": "Webhook оплаты" } as const;

export function redactDiagnosticText(value: string) {
  return value
    .replace(/\bBearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/\b(token|secret|password|signature|api[-_]?key)\s*[=:]\s*[^\s,;&]+/gi, "$1=[REDACTED]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL]");
}

export function buildErrorDiagnosticReport(group: StoredErrorGroup) {
  const report = [
    "ОШИБКА CLUB PWA",
    "",
    `Название: ${group.title}`,
    `Важность: ${severityLabels[group.severity]}`,
    `Статус: ${statusLabels[group.status]}`,
    `Источник: ${sourceLabels[group.source]}`,
    `Страница: ${group.route ?? "не определена"}`,
    `Версии: ${group.firstRelease ?? "не определена"} → ${group.latestRelease ?? "не определена"}`,
    `Первое событие: ${group.firstSeenAt.toISOString()}`,
    `Последнее событие: ${group.lastSeenAt.toISOString()}`,
    `Событий: ${group.totalCount}`,
    `Затронуто клиентов: ${group.affectedUsers}`,
    `Затронуто устройств: ${group.affectedDevices}`,
    `Технический тип: ${group.kind}`,
    `ID инцидента: ${group.id}`
  ].join("\n");
  return redactDiagnosticText(report);
}
