import { describe, expect, it } from "vitest";
import { buildExpiryReminderMessage, getDueExpiryReminderStages } from "./expiryReminderPlan";

describe("membership expiry reminder plan", () => {
  const expiresAt = new Date("2026-08-01T16:59:59.000Z"); // 23:59:59 in Novosibirsk

  it.each([
    ["2026-07-29T03:00:00.000Z", "three-days"],
    ["2026-07-31T03:00:00.000Z", "one-day"],
    ["2026-08-01T03:00:00.000Z", "expiry-day"]
  ] as const)("returns %s reminder at 10:00 project time", (now, stage) => {
    expect(getDueExpiryReminderStages(expiresAt, new Date(now))).toEqual([stage]);
  });

  it("does not return a reminder before 10:00 project time", () => {
    expect(getDueExpiryReminderStages(expiresAt, new Date("2026-07-31T02:59:59.000Z"))).toEqual([]);
  });

  it("does not return stale or post-expiry reminders", () => {
    expect(getDueExpiryReminderStages(expiresAt, new Date("2026-07-30T03:00:00.000Z"))).toEqual([]);
    expect(getDueExpiryReminderStages(expiresAt, new Date("2026-08-01T17:00:00.000Z"))).toEqual([]);
  });

  it("uses the exact expiry date and a renewal link in every channel", () => {
    const message = buildExpiryReminderMessage("one-day", expiresAt, "https://club.test/payments");

    expect(message.title).toBe("Доступ закончится завтра");
    expect(message.body).toContain("1 августа 2026 г.");
    expect(message.emailHtml).toContain("https://club.test/payments");
    expect(message.emailHtml).toContain("Продлить доступ");
  });
});
