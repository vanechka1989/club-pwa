export type OperationalAlertSeverity = "warning" | "critical" | "emergency" | "recovered";

type OperationalAlertEmailInput = {
  severity: OperationalAlertSeverity;
  detail: string;
  configuredFrom: string;
  sentAt?: Date;
};

const severityCopy: Record<OperationalAlertSeverity, { subject: string; status: string; color: string }> = {
  warning: { subject: "Внимание", status: "ТРЕБУЕТСЯ ВНИМАНИЕ", color: "#b7791f" },
  critical: { subject: "Критично", status: "КРИТИЧЕСКАЯ ПРОБЛЕМА", color: "#c53030" },
  emergency: { subject: "Авария", status: "АВАРИЙНАЯ СИТУАЦИЯ", color: "#9b2c2c" },
  recovered: { subject: "Восстановлено", status: "РАБОТАЕТ НОРМАЛЬНО", color: "#17845b" }
};

const unitEvents: Record<string, string> = {
  "club-pwa-backup.service": "Не создана резервная копия базы данных",
  "club-pwa-backup-verify.service": "Не пройдена проверка восстановления базы данных",
  "club-pwa-kuma-backup.service": "Не создана резервная копия мониторинга"
};

function senderAddress(configuredFrom: string) {
  return configuredFrom.match(/<\s*([^<>]+)\s*>/)?.[1]?.trim() || configuredFrom.trim();
}

function readableEvent(severity: OperationalAlertSeverity, detail: string) {
  if (severity === "recovered") return "Сервер работает нормально";
  const unit = detail.match(/Systemd unit ([A-Za-z0-9_.@:-]+) failed/)?.[1];
  return (unit && unitEvents[unit]) || detail;
}

function subjectEvent(event: string) {
  return event.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, 120) || "Изменилось состояние сервера";
}

function formatTime(date: Date) {
  const parts = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Novosibirsk",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("day")}.${value("month")}.${value("year")}, ${value("hour")}:${value("minute")}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function buildOperationalAlertEmail(input: OperationalAlertEmailInput) {
  const copy = severityCopy[input.severity];
  const event = readableEvent(input.severity, input.detail);
  const action = input.severity === "recovered"
    ? "Ничего делать не нужно."
    : "Проверьте сервер и устраните причину.";
  const time = formatTime(input.sentAt ?? new Date());
  const technicalDetail = event === input.detail || input.severity === "recovered"
    ? ""
    : `\nТехническая информация: ${input.detail}`;
  const text = [
    "СИСТЕМНОЕ УВЕДОМЛЕНИЕ CLUB PWA",
    "Автоматическое техническое уведомление. Клиентам клуба оно не отправляется.",
    "",
    `Статус: ${copy.status}`,
    `Событие: ${event}`,
    `Действие: ${action}`,
    `Время: ${time} (Новосибирск)${technicalDetail}`
  ].join("\n");

  const html = `<!doctype html>
<html lang="ru">
  <body style="margin:0;background:#f4f7f6;color:#15251f;font-family:Arial,sans-serif">
    <div style="max-width:620px;margin:0 auto;padding:24px 14px">
      <div style="border:1px solid #d8e4df;border-radius:18px;background:#ffffff;overflow:hidden">
        <div style="padding:18px 22px;background:#103c31;color:#ffffff">
          <div style="font-size:12px;font-weight:700;letter-spacing:.08em">СИСТЕМНОЕ УВЕДОМЛЕНИЕ</div>
          <div style="margin-top:5px;font-size:21px;font-weight:700">Club PWA</div>
        </div>
        <div style="padding:22px">
          <p style="margin:0 0 18px;color:#52635d;font-size:14px;line-height:1.5">Автоматическое техническое уведомление. Клиентам клуба оно не отправляется.</p>
          <div style="display:inline-block;padding:7px 10px;border-radius:9px;background:${copy.color};color:#ffffff;font-size:12px;font-weight:700">${escapeHtml(copy.status)}</div>
          <h1 style="margin:18px 0 14px;font-size:22px;line-height:1.3">${escapeHtml(event)}</h1>
          <p style="margin:8px 0;font-size:15px"><strong>Что делать:</strong> ${escapeHtml(action)}</p>
          <p style="margin:8px 0;color:#52635d;font-size:14px"><strong>Время:</strong> ${escapeHtml(time)} (Новосибирск)</p>
          ${technicalDetail ? `<div style="margin-top:18px;padding:12px;border-radius:10px;background:#f2f5f4;color:#52635d;font-size:12px;line-height:1.5"><strong>Техническая информация:</strong><br>${escapeHtml(input.detail)}</div>` : ""}
        </div>
      </div>
    </div>
  </body>
</html>`;

  return {
    from: { name: "Club PWA • Системный монитор", address: senderAddress(input.configuredFrom) },
    subject: `[СИСТЕМА] Club PWA — ${copy.subject}: ${subjectEvent(event)}`,
    text,
    html
  };
}
