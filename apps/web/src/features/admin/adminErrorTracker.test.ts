import { render, screen, waitFor } from "@testing-library/vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminErrorTracker from "./AdminErrorTracker.vue";

const api = vi.hoisted(() => ({
  getAdminErrorTrackerSummary: vi.fn(),
  getAdminErrorGroups: vi.fn(),
  getAdminErrorTrackerSettings: vi.fn(),
  getAdminErrorGroup: vi.fn(),
  updateAdminErrorGroupStatus: vi.fn(),
  updateAdminErrorTrackerSettings: vi.fn()
}));

vi.mock("@/api/client", () => api);

describe("AdminErrorTracker", () => {
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
});
