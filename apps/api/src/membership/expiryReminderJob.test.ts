import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  createMembershipExpiryReminderRunner,
  isAccessExpectedToExpire,
  membershipExpiryReminderIntervalMs,
  type ExpiryReminderJobDependencies
} from "./expiryReminderJob";

const now = new Date("2026-07-29T03:00:00.000Z");
const candidate = {
  subscriptionId: "subscription-1",
  userId: "user-1",
  email: "client@example.com",
  provider: "manual",
  expiresAt: new Date("2026-08-01T16:59:59.000Z")
};

function dependencies(overrides: Partial<ExpiryReminderJobDependencies> = {}): ExpiryReminderJobDependencies {
  return {
    listCandidates: vi.fn(async () => [candidate]),
    isCurrentSubscription: vi.fn(async () => true),
    claimDelivery: vi.fn(async ({ channel }) => ({ id: `delivery-${channel}` })),
    completeDelivery: vi.fn(async () => undefined),
    deliverPwa: vi.fn(async () => undefined),
    deliverPush: vi.fn(async () => undefined),
    deliverEmail: vi.fn(async () => undefined),
    renewalUrl: "https://club.test/payments",
    ...overrides
  };
}

describe("membership expiry reminder job", () => {
  it("delivers each due reminder through PWA, push, and email", async () => {
    const deps = dependencies();
    const result = await createMembershipExpiryReminderRunner(deps)(now);

    expect(result).toEqual({ candidates: 1, sent: 3, failed: 0, skipped: 0 });
    expect(deps.deliverPwa).toHaveBeenCalledWith(expect.objectContaining({ deliveryId: "delivery-pwa", stage: "three-days" }));
    expect(deps.deliverPush).toHaveBeenCalledWith(expect.objectContaining({ deliveryId: "delivery-push", stage: "three-days" }));
    expect(deps.deliverEmail).toHaveBeenCalledWith(expect.objectContaining({ deliveryId: "delivery-email", email: "client@example.com" }));
  });

  it("re-checks the exact subscription before claiming any channel", async () => {
    const deps = dependencies({ isCurrentSubscription: vi.fn(async () => false) });
    const result = await createMembershipExpiryReminderRunner(deps)(now);

    expect(result.skipped).toBe(1);
    expect(deps.claimDelivery).not.toHaveBeenCalled();
  });

  it("records one failed channel without repeating successful channels", async () => {
    const deps = dependencies({ deliverEmail: vi.fn(async () => Promise.reject(new Error("SMTP unavailable"))) });
    const result = await createMembershipExpiryReminderRunner(deps)(now);

    expect(result).toEqual({ candidates: 1, sent: 2, failed: 1, skipped: 0 });
    expect(deps.completeDelivery).toHaveBeenCalledWith("delivery-email", { status: "failed", error: "SMTP unavailable" }, now);
    expect(deps.completeDelivery).toHaveBeenCalledWith("delivery-pwa", { status: "sent" }, now);
    expect(deps.completeDelivery).toHaveBeenCalledWith("delivery-push", { status: "sent" }, now);
  });

  it("runs hourly through the guarded background job entry point", () => {
    expect(membershipExpiryReminderIntervalMs).toBe(60 * 60_000);
    const source = readFileSync(new URL("../backgroundJobs.ts", import.meta.url), "utf8");
    expect(source).toContain("startMembershipExpiryReminderJob");
    expect(source).toContain("clearInterval(membershipExpiryReminderTimer)");
  });

  it("does not warn an active recurring payer whose access is expected to renew", () => {
    expect(isAccessExpectedToExpire("lava_recurrent", "active")).toBe(false);
    expect(isAccessExpectedToExpire("prodamus_recurrent", "active")).toBe(false);
    expect(isAccessExpectedToExpire("lava_recurrent", "cancelled")).toBe(true);
    expect(isAccessExpectedToExpire("manual", null)).toBe(true);
  });
});
