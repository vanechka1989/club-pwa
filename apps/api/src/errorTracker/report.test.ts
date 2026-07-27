import { describe, expect, it } from "vitest";
import { buildErrorDiagnosticReport, redactDiagnosticText } from "./report";
import type { StoredErrorGroup } from "./store";

const group: StoredErrorGroup = {
  id: "506b24dd-1109-40e0-8933-1b96d0b1a619",
  fingerprint: "a".repeat(64),
  title: "Не удалось открыть оплату",
  source: "client",
  kind: "payment-open-error",
  severity: "critical",
  status: "new",
  route: "/billing",
  firstRelease: "5.73",
  latestRelease: "5.74",
  totalCount: 4,
  affectedUsers: 2,
  affectedDevices: 3,
  firstSeenAt: new Date("2026-07-27T08:00:00.000Z"),
  lastSeenAt: new Date("2026-07-27T08:05:00.000Z"),
  lastNotifiedAt: null,
  resolvedAt: null,
  mutedUntil: null
};

describe("error diagnostic report", () => {
  it("formats a stable copyable operational report", () => {
    const report = buildErrorDiagnosticReport(group);
    expect(report).toContain("ОШИБКА CLUB PWA");
    expect(report).toContain("Название: Не удалось открыть оплату");
    expect(report).toContain("Важность: Критично");
    expect(report).toContain("Страница: /billing");
    expect(report).toContain("Версии: 5.73 → 5.74");
    expect(report).toContain("Событий: 4");
    expect(report).toContain("Затронуто клиентов: 2");
    expect(report).toContain("Затронуто устройств: 3");
    expect(report).toContain("Технический тип: payment-open-error");
    expect(report).toContain("ID инцидента: 506b24dd-1109-40e0-8933-1b96d0b1a619");
    expect(report).not.toContain(group.fingerprint);
  });

  it("redacts secrets and email addresses without destroying labels", () => {
    const unsafe = "user@example.com Bearer abc123 token=secret password: hidden api_key=qwerty signature=raw";
    const safe = redactDiagnosticText(unsafe);
    expect(safe).toBe("[EMAIL] Bearer [REDACTED] token=[REDACTED] password=[REDACTED] api_key=[REDACTED] signature=[REDACTED]");
  });
});
