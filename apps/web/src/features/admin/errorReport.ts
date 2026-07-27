import type { AdminErrorTrackerDetailResponse } from "@club/shared";

const severityLabels = { warning: "Внимание", error: "Ошибка", critical: "Критично" } as const;
const statusLabels = { new: "Новая", acknowledged: "В работе", resolved: "Решена", ignored: "Игнорируется" } as const;
const sourceLabels = { client: "Клиент", api: "API", "background-job": "Фоновая задача", "payment-webhook": "Webhook оплаты" } as const;

export function redactAdminDiagnosticText(value: string) {
  return value
    .replace(/\bBearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/\b(token|secret|password|signature|api[-_]?key)\s*[=:]\s*[^\s,;&]+/gi, "$1=[REDACTED]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL]");
}

export function buildAdminErrorReport(detail: AdminErrorTrackerDetailResponse) {
  const { group } = detail;
  const latest = detail.occurrences[0];
  const lines = [
    "ОШИБКА CLUB PWA",
    "",
    `Название: ${group.title}`,
    `Важность: ${severityLabels[group.severity]}`,
    `Статус: ${statusLabels[group.status]}`,
    `Источник: ${sourceLabels[group.source]}`,
    `Страница: ${group.route ?? "не определена"}`,
    `Версии: ${group.firstRelease ?? "не определена"} → ${group.latestRelease ?? "не определена"}`,
    `Первое событие: ${group.firstSeenAt}`,
    `Последнее событие: ${group.lastSeenAt}`,
    `Событий: ${group.totalCount}`,
    `Затронуто клиентов: ${group.affectedUsers}`,
    `Затронуто устройств: ${group.affectedDevices}`,
    `Технический тип: ${group.kind}`,
    `ID инцидента: ${group.id}`
  ];
  if (latest) {
    lines.push(
      "",
      "ПОСЛЕДНЕЕ СОБЫТИЕ",
      `Время: ${latest.occurredAt}`,
      `Сообщение: ${latest.message}`,
      `Платформа: ${latest.platform ?? "не определена"}`,
      `Версия: ${latest.release ?? "не определена"}`,
      `HTTP: ${[latest.method, latest.httpStatus].filter((value) => value !== null).join(" ") || "не определён"}`,
      `ID события: ${latest.id}`
    );
    if (latest.userAgent) lines.push(`User-Agent: ${latest.userAgent}`);
    if (Object.keys(latest.context).length) lines.push(`Контекст: ${JSON.stringify(latest.context)}`);
    if (latest.stack) lines.push("", `Стек:\n${latest.stack}`);
  }
  return redactAdminDiagnosticText(lines.join("\n"));
}

export async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}
