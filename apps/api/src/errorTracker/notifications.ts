import type { StoredErrorGroup } from "./store";
import { buildErrorDiagnosticReport, redactDiagnosticText } from "./report";

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
const severityIcons = { warning: "🟡", error: "🟠", critical: "🔴" } as const;
const severityColors = { warning: "#e3b341", error: "#ff9d5c", critical: "#ff6b7a" } as const;

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
  const detailUrl = `${origin.replace(/\/$/, "")}/admin/server/errors/${group.id}`;
  const safeTitle = redactDiagnosticText(group.title);
  const subject = redactDiagnosticText(`[${severityLabels[group.severity]}] Club PWA · ${group.title}`).slice(0, 180);
  const report = buildErrorDiagnosticReport(group);
  const lines = [
    "Автоматическое техническое уведомление Club PWA. Клиентам оно не отправляется.",
    "",
    report,
    "",
    `Открыть ошибку: ${detailUrl}`
  ];
  const text = lines.join("\n");
  const accent = severityColors[group.severity];
  const diagnosticHtml = escapeHtml(report).replace(/\n/g, "<br>");
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#061510;color:#effbf6;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#061510"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#0b261e;border:1px solid #285346;border-top:4px solid ${accent};border-radius:16px;overflow:hidden"><tr><td style="padding:24px"><div style="color:#63dac1;font-size:13px;font-weight:700;letter-spacing:.04em">Club PWA · Центр ошибок</div><div style="margin-top:16px;color:${accent};font-size:13px;font-weight:700">${severityIcons[group.severity]} ${severityLabels[group.severity]}</div><h1 style="margin:8px 0 0;color:#ffffff;font-size:24px;line-height:1.3">${escapeHtml(safeTitle)}</h1><p style="margin:10px 0 0;color:#a9c5bc;font-size:14px;line-height:1.5">Автоматическое техническое уведомление. Клиентам оно не отправляется.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:20px"><tr><td style="width:33%;padding:12px;background:#12372c;border-radius:10px;color:#a9c5bc;font-size:12px">События<br><strong style="color:#fff;font-size:20px">${group.totalCount}</strong></td><td style="width:8px"></td><td style="width:33%;padding:12px;background:#12372c;border-radius:10px;color:#a9c5bc;font-size:12px">Клиенты<br><strong style="color:#fff;font-size:20px">${group.affectedUsers}</strong></td><td style="width:8px"></td><td style="width:33%;padding:12px;background:#12372c;border-radius:10px;color:#a9c5bc;font-size:12px">Устройства<br><strong style="color:#fff;font-size:20px">${group.affectedDevices}</strong></td></tr></table><div style="margin-top:20px;padding:16px;background:#071d18;border:1px solid #21493d;border-radius:12px;color:#cfe3dc;font-family:Consolas,Monaco,monospace;font-size:12px;line-height:1.6;word-break:break-word">${diagnosticHtml}</div><p style="margin:24px 0 0"><a href="${escapeHtml(detailUrl)}" style="display:inline-block;padding:13px 20px;background:#35d5bd;color:#05221b;text-decoration:none;border-radius:12px;font-weight:700">Открыть ошибку</a></p><p style="margin:16px 0 0;color:#789c91;font-size:11px;line-height:1.5;word-break:break-all">${escapeHtml(detailUrl)}</p></td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}

export async function dispatchErrorNotifications(group: StoredErrorGroup, dependencies: NotificationDependencies) {
  const url = `/admin/server/errors/${group.id}`;
  const pushTask = async () => {
    if (!dependencies.pushEnabled || dependencies.recipientUserIds.length === 0) {
      await dependencies.recordDelivery({ channel: "push", status: "skipped", error: null });
      return;
    }
    try {
      await dependencies.sendPush(dependencies.recipientUserIds, {
        title: redactDiagnosticText(`${severityIcons[group.severity]} ${severityLabels[group.severity]} · ${group.title}`).slice(0, 120),
        body: redactDiagnosticText(`${group.route ?? "раздел не определён"} · v${group.latestRelease ?? "—"} · ${group.totalCount} ${group.totalCount === 1 ? "событие" : group.totalCount < 5 ? "события" : "событий"}`),
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
