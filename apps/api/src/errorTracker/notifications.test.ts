import { describe, expect, it, vi } from "vitest";
import { buildErrorAlertEmail, dispatchErrorNotifications } from "./notifications";
import type { StoredErrorGroup } from "./store";

const group: StoredErrorGroup = {
  id: "506b24dd-1109-40e0-8933-1b96d0b1a619",
  fingerprint: "a".repeat(64),
  title: "Не удалось открыть оплату",
  source: "client",
  kind: "window-error",
  severity: "critical",
  status: "new",
  route: "/billing",
  firstRelease: "5.73",
  latestRelease: "5.73",
  totalCount: 4,
  affectedUsers: 2,
  affectedDevices: 2,
  firstSeenAt: new Date("2026-07-27T08:00:00.000Z"),
  lastSeenAt: new Date("2026-07-27T08:05:00.000Z"),
  lastNotifiedAt: null,
  resolvedAt: null,
  mutedUntil: null
};

describe("error tracker notifications", () => {
  it("builds a safe operational email with an internal incident link", () => {
    const message = buildErrorAlertEmail(group, "https://club.example");
    expect(message.subject).toContain("[КРИТИЧНО]");
    expect(message.text).toContain("https://club.example/admin/server/logs?error=506b24dd-1109-40e0-8933-1b96d0b1a619");
    expect(message.text).toContain("Затронуто клиентов: 2");
    expect(message.text).not.toContain("fingerprint");
  });

  it("records email failure while still delivering push", async () => {
    const sendPush = vi.fn().mockResolvedValue({ sent: 1 });
    const sendEmail = vi.fn().mockRejectedValue(new Error("SMTP password=hidden"));
    const deliveries: Array<{ channel: string; status: string; error: string | null }> = [];

    await dispatchErrorNotifications(group, {
      origin: "https://club.example",
      recipientUserIds: ["4d914956-c82e-4b61-9f20-a37866613aa1"],
      email: "developer@example.com",
      pushEnabled: true,
      emailEnabled: true,
      sendPush,
      sendEmail,
      recordDelivery: async (delivery) => { deliveries.push(delivery); }
    });

    expect(sendPush).toHaveBeenCalledOnce();
    expect(deliveries).toContainEqual({ channel: "push", status: "sent", error: null });
    expect(deliveries).toContainEqual({ channel: "email", status: "failed", error: "SMTP password=[REDACTED]" });
  });

  it("marks disabled channels as skipped without calling transports", async () => {
    const sendPush = vi.fn();
    const sendEmail = vi.fn();
    const statuses: string[] = [];
    await dispatchErrorNotifications(group, {
      origin: "https://club.example",
      recipientUserIds: [],
      email: null,
      pushEnabled: false,
      emailEnabled: false,
      sendPush,
      sendEmail,
      recordDelivery: async ({ status }) => { statuses.push(status); }
    });
    expect(sendPush).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(statuses).toEqual(["skipped", "skipped"]);
  });
});
