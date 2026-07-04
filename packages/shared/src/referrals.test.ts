import { describe, expect, it } from "vitest";
import {
  adminPermissionLabels,
  adminPermissionSchema,
  adminProjectSettingsResponseSchema,
  adminUserDetailResponseSchema,
  referralProfileResponseSchema
} from "./index";

describe("referral contracts", () => {
  it("exposes the project settings admin permission", () => {
    expect(adminPermissionSchema.parse("project_settings")).toBe("project_settings");
    expect(adminPermissionLabels.project_settings).toBe("Настройки проекта");
  });

  it("parses the referral profile summary", () => {
    const parsed = referralProfileResponseSchema.parse({
      referral: {
        code: "abc12345",
        link: "https://t.me/club_bot?start=ref_abc12345",
        availableDays: 14,
        invitedCount: 3,
        paidCount: 2,
        canActivate: true,
        activationBlockedReason: null
      }
    });

    expect(parsed.referral.availableDays).toBe(14);
  });

  it("parses project settings", () => {
    const parsed = adminProjectSettingsResponseSchema.parse({
      settings: {
        referralRewardDays: 7
      }
    });

    expect(parsed.settings.referralRewardDays).toBe(7);
  });

  it("adds referrals to admin client details", () => {
    const parsed = adminUserDetailResponseSchema.parse({
      user: {
        id: "user-1",
        telegramId: "100",
        firstName: "Ivan",
        username: "ivan",
        photoUrl: null,
        role: "member",
        membershipStatus: "active",
        membershipExpiresAt: null,
        tariff: "manual",
        hasRestrictions: false,
        paymentType: "manual",
        completedItems: 0,
        totalItems: 0,
        lastOpenedItemTitle: null,
        lastOpenedAt: null,
        lastLoginAt: "2026-07-04T10:00:00.000Z",
        telegramBotStatus: "unknown",
        telegramBotBlockedAt: null,
        telegramBotUnblockedAt: null,
        createdAt: "2026-07-04T09:00:00.000Z"
      },
      subscriptions: [],
      moderationEvents: [],
      device: null,
      referrals: {
        invitedBy: null,
        invited: [
          {
            id: "ref-1",
            invitedAt: "2026-07-04T10:00:00.000Z",
            firstPaidAt: null,
            rewardDays: 7,
            rewardStatus: "available",
            invitedUser: {
              telegramId: "200",
              firstName: "Anna",
              username: "anna",
              photoUrl: null
            }
          }
        ]
      }
    });

    expect(parsed.referrals.invited[0]?.invitedUser.telegramId).toBe("200");
  });
});
