import { describe, expect, it } from "vitest";
import { buildOperationalAlertEmail } from "./operationalAlertEmail";

const sentAt = new Date("2026-07-22T10:34:00.000Z");

describe("operational alert email", () => {
  it("marks a disk warning as an owner-only system notification", () => {
    const message = buildOperationalAlertEmail({
      severity: "warning",
      detail: "Диск заполнен на 77%",
      configuredFrom: "Club <alerts@example.com>",
      sentAt
    });

    expect(message.from).toEqual({
      name: "Club PWA • Системный монитор",
      address: "alerts@example.com"
    });
    expect(message.subject).toBe("[СИСТЕМА] Club PWA — Внимание: Диск заполнен на 77%");
    expect(message.text).toContain("Автоматическое техническое уведомление. Клиентам клуба оно не отправляется.");
    expect(message.text).toContain("Статус: ТРЕБУЕТСЯ ВНИМАНИЕ");
    expect(message.text).toContain("Действие: Проверьте сервер и устраните причину.");
    expect(message.text).toContain("Время: 22.07.2026, 17:34 (Новосибирск)");
  });

  it("translates a known systemd backup unit into a readable event", () => {
    const message = buildOperationalAlertEmail({
      severity: "critical",
      detail: "Systemd unit club-pwa-kuma-backup.service failed on host-1 at 2026-07-22T09:30:00Z",
      configuredFrom: "alerts@example.com",
      sentAt
    });

    expect(message.subject).toBe("[СИСТЕМА] Club PWA — Критично: Не создана резервная копия мониторинга");
    expect(message.text).toContain("Событие: Не создана резервная копия мониторинга");
    expect(message.text).toContain("Техническая информация: Systemd unit club-pwa-kuma-backup.service failed");
  });

  it("makes recovery messages explicit and non-actionable", () => {
    const message = buildOperationalAlertEmail({
      severity: "recovered",
      detail: "Все контролируемые показатели сервера в норме",
      configuredFrom: "Club <alerts@example.com>",
      sentAt
    });

    expect(message.subject).toBe("[СИСТЕМА] Club PWA — Восстановлено: Сервер работает нормально");
    expect(message.text).toContain("Статус: РАБОТАЕТ НОРМАЛЬНО");
    expect(message.text).toContain("Действие: Ничего делать не нужно.");
  });

  it("preserves unknown diagnostics as text and escapes them in HTML", () => {
    const message = buildOperationalAlertEmail({
      severity: "emergency",
      detail: "Неизвестный сбой <script>alert(1)</script>",
      configuredFrom: "alerts@example.com",
      sentAt
    });

    expect(message.subject).toBe("[СИСТЕМА] Club PWA — Авария: Неизвестный сбой alert(1)");
    expect(message.text).toContain("Неизвестный сбой <script>alert(1)</script>");
    expect(message.html).not.toContain("<script>");
    expect(message.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});
