import { describe, expect, it, vi } from "vitest";
import { currentRelease } from "@club/shared";
import { createErrorTrackerTestIncident } from "./testIncident";

describe("error tracker test incident", () => {
  it("records a unique critical test event through the normal tracker", async () => {
    const recorded = {
      group: { id: "506b24dd-1109-40e0-8933-1b96d0b1a619" },
      occurrenceId: "a77f8ea7-93e7-4fac-b5a8-7f042e097fa5",
      shouldNotify: true
    };
    const record = vi.fn().mockResolvedValue(recorded);
    const occurredAt = new Date("2026-07-27T06:40:00.000Z");

    const result = await createErrorTrackerTestIncident(
      { userId: "owner-user-id", installationId: "owner-admin-test" },
      { occurredAt, runId: "52a06ed4-9c0f-4b31-a9c0-b63d31b858fe", record }
    );

    expect(result).toBe(recorded);
    expect(record).toHaveBeenCalledWith({
      source: "client",
      kind: "admin-test-payment-monitoring:52a06ed49c0f4b31a9c0b63d31b858fe",
      title: "[ТЕСТ] Проверка центра ошибок",
      message: "Тестовая критическая ошибка создана владельцем приложения.",
      route: "/admin/server/logs",
      method: "POST",
      stack: "error-tracker-test:52a06ed4-9c0f-4b31-a9c0-b63d31b858fe",
      detail: { test: true, initiatedBy: "owner" },
      release: currentRelease.version,
      platform: "admin-test",
      displayMode: "pwa",
      online: true,
      installationId: "owner-admin-test",
      occurredAt
    }, { userId: "owner-user-id", installationId: "owner-admin-test" });
  });
});
