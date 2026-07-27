import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminErrorTrackerDetailResponse } from "@club/shared";
import { buildAdminErrorReport, copyText } from "./errorReport";

const detail: AdminErrorTrackerDetailResponse = {
  group: {
    id: "506b24dd-1109-40e0-8933-1b96d0b1a619", fingerprint: "a".repeat(64), title: "Не удалось открыть оплату",
    source: "client", kind: "payment-open-error:83a2e303", severity: "critical", status: "new", route: "/billing",
    firstRelease: "5.73", latestRelease: "5.74", totalCount: 7, affectedUsers: 2, affectedDevices: 3,
    firstSeenAt: "2026-07-27T08:00:00.000Z", lastSeenAt: "2026-07-27T08:05:00.000Z", lastNotifiedAt: null,
    resolvedAt: null, mutedUntil: null
  },
  occurrences: [{
    id: "9db38811-2236-4126-8c86-86302b7b80f3", message: "Request failed token=secret user@example.com",
    stack: "Error: failed\n at payment password: hidden", route: "/billing", method: "POST", httpStatus: 502,
    release: "5.74", userId: null, installationId: "install-1", platform: "Android 14", userAgent: "Chrome Mobile",
    context: { provider: "lava" }, occurredAt: "2026-07-27T08:05:00.000Z"
  }],
  deliveries: []
};

describe("admin error report", () => {
  afterEach(() => vi.restoreAllMocks());

  it("formats the full latest occurrence and redacts sensitive values", () => {
    const report = buildAdminErrorReport(detail);
    expect(report).toContain("Название: Не удалось открыть оплату");
    expect(report).toContain("Технический тип: payment-open-error:83a2e303");
    expect(report).toContain("Сообщение: Request failed token=[REDACTED] [EMAIL]");
    expect(report).toContain("Платформа: Android 14");
    expect(report).toContain("HTTP: POST 502");
    expect(report).toContain("Стек:\nError: failed\n at payment password=[REDACTED]");
    expect(report).not.toContain(detail.group.fingerprint);
  });

  it("uses the Clipboard API when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    await copyText("diagnostic report");
    expect(writeText).toHaveBeenCalledWith("diagnostic report");
  });

  it("falls back to a temporary textarea", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", { configurable: true, value: execCommand });
    await copyText("fallback report");
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).toBeNull();
  });
});
