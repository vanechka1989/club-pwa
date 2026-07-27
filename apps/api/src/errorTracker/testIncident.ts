import { currentRelease } from "@club/shared/release";
import type { RawErrorEvent } from "./domain";
import type { ErrorIdentity, RecordedError } from "./store";

type RecordTrackedError = (event: RawErrorEvent, identity: ErrorIdentity) => Promise<RecordedError>;

export function createErrorTrackerTestIncident(
  identity: ErrorIdentity,
  options: { occurredAt?: Date; runId: string; record: RecordTrackedError }
) {
  const installationId = identity.installationId ?? "owner-admin-test";
  const compactRunId = options.runId.replaceAll("-", "");
  return options.record({
    source: "client",
    kind: `admin-test-payment-monitoring:${compactRunId}`,
    title: "[ТЕСТ] Проверка центра ошибок",
    message: "Тестовая критическая ошибка создана владельцем приложения.",
    route: "/admin/server/logs",
    method: "POST",
    stack: `error-tracker-test:${options.runId}`,
    detail: { test: true, initiatedBy: "owner" },
    release: currentRelease.version,
    platform: "admin-test",
    displayMode: "pwa",
    online: true,
    installationId,
    occurredAt: options.occurredAt ?? new Date()
  }, { ...identity, installationId });
}
