import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminErrorTracker from "./AdminErrorTracker.vue";

const api = vi.hoisted(() => ({
  getAdminErrorTrackerSummary: vi.fn(),
  getAdminErrorGroups: vi.fn(),
  getAdminErrorTrackerSettings: vi.fn(),
  getAdminErrorGroup: vi.fn(),
  createAdminErrorTrackerTestIncident: vi.fn(),
  updateAdminErrorGroupStatus: vi.fn(),
  updateAdminErrorTrackerSettings: vi.fn()
}));

vi.mock("@/api/client", () => api);

describe("AdminErrorTracker", () => {
  afterEach(cleanup);
  beforeEach(() => {
    api.getAdminErrorTrackerSummary.mockResolvedValue({ newCritical: 1, activeGroups: 3, affectedUsers24h: 2, occurrences24h: 7 });
    api.getAdminErrorGroups.mockResolvedValue({
      total: 1, nextCursor: null,
      groups: [{
        id: "506b24dd-1109-40e0-8933-1b96d0b1a619", fingerprint: "a".repeat(64), title: "Не удалось открыть оплату",
        source: "client", kind: "window-error", severity: "critical", status: "new", route: "/billing",
        firstRelease: "5.73", latestRelease: "5.73", totalCount: 7, affectedUsers: 2, affectedDevices: 2,
        firstSeenAt: "2026-07-27T08:00:00.000Z", lastSeenAt: "2026-07-27T08:05:00.000Z", lastNotifiedAt: null,
        resolvedAt: null, mutedUntil: null
      }]
    });
    api.getAdminErrorTrackerSettings.mockResolvedValue({ email: "developer@example.com", emailEnabled: true, pushEnabled: true });
  });

  it("renders incident impact and configurable notification channels", async () => {
    render(AdminErrorTracker);
    expect(await screen.findByText("Не удалось открыть оплату")).toBeTruthy();
    expect(screen.getByText("Новые критичные")).toBeTruthy();
    expect(screen.getByText("7 событий")).toBeTruthy();
    await waitFor(() => expect((screen.getByLabelText("Почта для ошибок") as HTMLInputElement).value).toBe("developer@example.com"));
    expect(screen.getByLabelText("PWA push")).toBeTruthy();
  });

  it("creates and opens a test incident through the real tracker action", async () => {
    const groupId = "83c765f0-8f73-4723-8b68-f67a51e090ac";
    api.createAdminErrorTrackerTestIncident.mockResolvedValue({ ok: true, groupId });
    api.getAdminErrorGroup.mockResolvedValue({
      group: {
        id: groupId, fingerprint: "b".repeat(64), title: "[ТЕСТ] Проверка центра ошибок",
        source: "client", kind: "admin-test-payment-monitoring", severity: "critical", status: "new", route: "/admin/server/logs",
        firstRelease: "5.74", latestRelease: "5.74", totalCount: 1, affectedUsers: 1, affectedDevices: 1,
        firstSeenAt: "2026-07-27T06:40:00.000Z", lastSeenAt: "2026-07-27T06:40:00.000Z", lastNotifiedAt: "2026-07-27T06:40:00.000Z",
        resolvedAt: null, mutedUntil: null
      },
      occurrences: [{
        id: "9db38811-2236-4126-8c86-86302b7b80f3", groupId, message: "Тестовая критическая ошибка создана владельцем приложения.",
        stack: null, detail: { test: true }, release: "5.74", platform: "admin-test", occurredAt: "2026-07-27T06:40:00.000Z"
      }],
      deliveries: []
    });

    render(AdminErrorTracker);
    await screen.findByText("Не удалось открыть оплату");
    await screen.getByRole("button", { name: "Создать тестовую ошибку" }).click();

    await waitFor(() => expect(api.getAdminErrorGroup).toHaveBeenCalledWith(groupId));
    expect(await screen.findByText("Тестовая критическая ошибка создана владельцем приложения.")).toBeTruthy();
    expect(screen.getByText("Тестовая ошибка создана. Проверьте включённые push и email.")).toBeTruthy();
  });

  it("copies a complete report and the technical type from an opened incident", async () => {
    const group = (await api.getAdminErrorGroups()).groups[0];
    api.getAdminErrorGroup.mockResolvedValue({
      group,
      occurrences: [{
        id: "9db38811-2236-4126-8c86-86302b7b80f3", message: "Payment failed", stack: "Error: payment failed",
        route: "/billing", method: "POST", httpStatus: 502, release: "5.73", userId: null,
        installationId: "install-1", platform: "Android 14", userAgent: "Chrome Mobile", context: {},
        occurredAt: "2026-07-27T08:05:00.000Z"
      }],
      deliveries: []
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });

    render(AdminErrorTracker);
    await fireEvent.click(await screen.findByRole("button", { name: /Не удалось открыть оплату/ }));
    await fireEvent.click(await screen.findByRole("button", { name: "Скопировать отчёт" }));
    expect(writeText.mock.calls[0]?.[0]).toContain("Название: Не удалось открыть оплату");
    expect(await screen.findByText("Отчёт скопирован.")).toBeTruthy();

    await fireEvent.click(screen.getByRole("button", { name: "Скопировать технический тип" }));
    expect(writeText).toHaveBeenLastCalledWith("window-error");
    expect(await screen.findByText("Технический тип скопирован.")).toBeTruthy();
  });
});
