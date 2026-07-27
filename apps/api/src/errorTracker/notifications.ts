import type { StoredErrorGroup } from "./store";

type Delivery = { channel: "push" | "email"; status: "sent" | "failed" | "skipped"; error: string | null };

type NotificationDependencies = {
  origin: string;
  recipientUserIds: string[];
  email: string | null;
  pushEnabled: boolean;
  emailEnabled: boolean;
  sendPush: (userIds: string[], payload: { title: string; body: string; url: string }) => Promise<unknown>;
  sendEmail: (input: { to: string; subject: string; text: string; html: string }) => Promise<unknown>;
  recordDelivery: (delivery: Delivery) => Promise<void>;
};

const severityLabels = { warning: "ВНИМАНИЕ", error: "ОШИБКА", critical: "КРИТИЧНО" } as const;

function safeDeliveryError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/\bBearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/\b(token|secret|password|signature|api[-_]?key)\s*[=:]\s*[^\s,;&]+/gi, "$1=[REDACTED]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL]")
    .slice(0, 500);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

export function buildErrorAlertEmail(group: StoredErrorGroup, origin: string) {
  const detailUrl = `${origin.replace(/\/$/, "")}/admin/server/logs?error=${group.id}`;
  const subject = `[${severityLabels[group.severity]}] Club PWA · ${group.title}`.slice(0, 180);
  const lines = [
    "Автоматическое техническое уведомление Club PWA. Клиентам оно не отправляется.",
    "",
    group.title,
    `Источник: ${group.source}`,
    `Раздел: ${group.route ?? "не определён"}`,
    `Версия: ${group.latestRelease ?? "не определена"}`,
    `Повторений: ${group.totalCount}`,
    `Затронуто клиентов: ${group.affectedUsers}`,
    `Последний случай: ${group.lastSeenAt.toISOString()}`,
    "",
    `Открыть инцидент: ${detailUrl}`
  ];
  const text = lines.join("\n");
  const html = `<div style="font-family:system-ui,sans-serif;line-height:1.5"><p>${escapeHtml(lines[0]!)}</p><h2>${escapeHtml(group.title)}</h2><ul><li>Источник: ${escapeHtml(group.source)}</li><li>Раздел: ${escapeHtml(group.route ?? "не определён")}</li><li>Версия: ${escapeHtml(group.latestRelease ?? "не определена")}</li><li>Повторений: ${group.totalCount}</li><li>Затронуто клиентов: ${group.affectedUsers}</li></ul><p><a href="${escapeHtml(detailUrl)}">Открыть инцидент</a></p></div>`;
  return { subject, text, html };
}

export async function dispatchErrorNotifications(group: StoredErrorGroup, dependencies: NotificationDependencies) {
  const url = `/admin/server/logs?error=${group.id}`;
  const pushTask = async () => {
    if (!dependencies.pushEnabled || dependencies.recipientUserIds.length === 0) {
      await dependencies.recordDelivery({ channel: "push", status: "skipped", error: null });
      return;
    }
    try {
      await dependencies.sendPush(dependencies.recipientUserIds, {
        title: `${severityLabels[group.severity]} · ${group.title}`.slice(0, 120),
        body: `${group.totalCount} событий · ${group.affectedUsers} клиентов`,
        url
      });
      await dependencies.recordDelivery({ channel: "push", status: "sent", error: null });
    } catch (error) {
      await dependencies.recordDelivery({ channel: "push", status: "failed", error: safeDeliveryError(error) });
    }
  };
  const emailTask = async () => {
    if (!dependencies.emailEnabled || !dependencies.email) {
      await dependencies.recordDelivery({ channel: "email", status: "skipped", error: null });
      return;
    }
    try {
      await dependencies.sendEmail({ to: dependencies.email, ...buildErrorAlertEmail(group, dependencies.origin) });
      await dependencies.recordDelivery({ channel: "email", status: "sent", error: null });
    } catch (error) {
      await dependencies.recordDelivery({ channel: "email", status: "failed", error: safeDeliveryError(error) });
    }
  };
  await Promise.all([pushTask(), emailTask()]);
}
