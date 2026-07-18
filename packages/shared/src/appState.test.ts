import { describe, expect, it } from "vitest";
import { appStateResponseSchema } from "./index";

describe("app state response", () => {
  it("accepts the lightweight access and unread counters payload", () => {
    const result = appStateResponseSchema.parse({
      access: {
        role: "member",
        realRole: "member",
        adminRoleLabel: null,
        adminPermissions: [],
        membershipStatus: "active",
        membershipExpiresAt: "2026-08-18T00:00:00.000Z",
        paymentType: "one_time",
        recurrentPaymentStatus: null,
        nextPaymentAt: null
      },
      notificationUnreadCount: 2,
      supportUnreadCount: 1
    });

    expect(result.notificationUnreadCount).toBe(2);
    expect(result.access.membershipStatus).toBe("active");
  });

  it("rejects negative unread counters", () => {
    const result = appStateResponseSchema.safeParse({
      access: {
        role: "member",
        realRole: "member",
        adminRoleLabel: null,
        adminPermissions: [],
        membershipStatus: "inactive",
        membershipExpiresAt: null,
        paymentType: "none",
        recurrentPaymentStatus: null,
        nextPaymentAt: null
      },
      notificationUnreadCount: -1,
      supportUnreadCount: 0
    });

    expect(result.success).toBe(false);
  });
});
