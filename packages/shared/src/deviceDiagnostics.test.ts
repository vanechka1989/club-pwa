import { describe, expect, it } from "vitest";
import { adminUserDetailResponseSchema, deviceDiagnosticsSchema } from "./index";

describe("device diagnostics schema", () => {
  it("accepts client device diagnostics in the admin detail response", () => {
    const device = {
      installationId: "3b8c9d54-6f52-4d57-9b62-d3bdf2f5fa7a",
      capturedAt: "2026-07-01T10:00:00.000Z",
      platform: "android",
      colorScheme: "dark",
      userAgent: "Mozilla/5.0 (Linux; Android 13; JLN-LX1)",
      screen: { width: 1080, height: 2388, availWidth: 1080, availHeight: 2290, pixelRatio: 2.75 },
      viewport: { width: 393, height: 851 },
      visualViewport: { width: 393, height: 740, offsetTop: 0, scale: 1 },
      browser: {
        displayMode: "standalone",
        standalone: true,
        safeAreaInset: { top: 0, bottom: 24, left: 0, right: 0 }
      },
      layoutCalibration: { bottomOffsetPx: 24, source: "android" },
      classes: ["club-android"]
    };

    expect(deviceDiagnosticsSchema.parse(device).platform).toBe("android");
    expect(
      adminUserDetailResponseSchema.parse({
        user: {
          id: "user-id",
          telegramId: "100",
          firstName: null,
          username: null,
          photoUrl: null,
          role: "member",
          membershipStatus: "inactive",
          membershipExpiresAt: null,
          tariff: null,
          hasRestrictions: false,
          completedItems: 0,
          totalItems: 0,
          lastOpenedItemTitle: null,
          lastOpenedAt: null,
          lastLoginAt: "2026-07-01T10:00:00.000Z",
          telegramBotStatus: "unknown",
          telegramBotBlockedAt: null,
          telegramBotUnblockedAt: null,
          createdAt: "2026-07-01T10:00:00.000Z"
        },
        subscriptions: [],
        moderationEvents: [],
        device,
        devices: [
          {
            id: "d6a7cb95-7df1-4017-8428-b37f6f33eb90",
            firstSeenAt: "2026-07-01T10:00:00.000Z",
            lastSeenAt: "2026-07-02T11:00:00.000Z",
            diagnostics: device
          }
        ]
      }).device
    ).toEqual(device);
  });
});
