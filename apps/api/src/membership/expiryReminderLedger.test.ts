import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getExpiryReminderRetryAt, isExpiryReminderDeliveryClaimable } from "./expiryReminderLedger";

describe("membership expiry reminder delivery ledger", () => {
  it("has an indexed, channel-specific idempotency ledger", () => {
    const migrationPath = resolve(__dirname, "../../drizzle/0056_membership_expiry_reminders.sql");
    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain('CREATE TABLE "membership_expiry_reminder_deliveries"');
    expect(sql).toContain('membership_expiry_reminders_subscription_expiry_stage_channel_idx');
    expect(sql).toContain('membership_expiry_reminders_status_retry_idx');
    expect(sql).toContain('subscriptions_status_expires_at_idx');
  });

  it("claims new, due failed, and stale processing deliveries only", () => {
    const now = new Date("2026-07-26T03:00:00.000Z");
    expect(isExpiryReminderDeliveryClaimable(null, now)).toBe(true);
    expect(isExpiryReminderDeliveryClaimable({ status: "failed", attemptCount: 1, nextAttemptAt: now, updatedAt: now }, now)).toBe(true);
    expect(isExpiryReminderDeliveryClaimable({ status: "failed", attemptCount: 3, nextAttemptAt: now, updatedAt: now }, now)).toBe(false);
    expect(
      isExpiryReminderDeliveryClaimable(
        { status: "processing", attemptCount: 1, nextAttemptAt: null, updatedAt: new Date(now.getTime() - 16 * 60_000) },
        now
      )
    ).toBe(true);
    expect(isExpiryReminderDeliveryClaimable({ status: "sent", attemptCount: 1, nextAttemptAt: null, updatedAt: now }, now)).toBe(false);
  });

  it("retries after 15 minutes and then after 60 minutes", () => {
    const now = new Date("2026-07-26T03:00:00.000Z");
    expect(getExpiryReminderRetryAt(1, now)?.toISOString()).toBe("2026-07-26T03:15:00.000Z");
    expect(getExpiryReminderRetryAt(2, now)?.toISOString()).toBe("2026-07-26T04:00:00.000Z");
    expect(getExpiryReminderRetryAt(3, now)).toBeNull();
  });
});
