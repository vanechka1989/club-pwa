import { describe, expect, it } from "vitest";
import {
  calculateLayoutCalibration,
  collectDeviceDiagnostics,
  getDeviceLayoutClasses,
  getMeasuredKeyboardBottomGap,
  getMeasuredVisibleViewportHeight,
  getViewportSizeClasses
} from "./deviceLayout";

describe("device layout detection", () => {
  it("calculates separate compact Android offsets for normal tabs and open chat", () => {
    const calibration = calculateLayoutCalibration({
      platform: "android",
      userAgent:
        "Mozilla/5.0 (Linux; Android 12; K) AppleWebKit/537.36 Telegram-Android/12.8.3 (Huawei JLN-LX1; Android 12)",
      viewportWidth: 360,
      viewportHeight: 796,
      safeAreaInset: { top: 35.333332, bottom: 0, left: 0, right: 0 },
      contentSafeAreaInset: { top: 46, bottom: 0, left: 0, right: 0 },
      visualBottomGap: 0
    });

    expect(calibration.topOffsetPx).toBe(98);
    expect(calibration.chatTopOffsetPx).toBe(116);
    expect(calibration.bottomOffsetPx).toBe(0);
    expect(calibration.source).toBe("android-narrow");
  });

  it("keeps wider Samsung Android screens from receiving the narrow top air", () => {
    const calibration = calculateLayoutCalibration({
      platform: "android",
      userAgent:
        "Mozilla/5.0 (Linux; Android 16; K) AppleWebKit/537.36 Telegram-Android/12.8.3 (Samsung SM-S938B; Android 16)",
      viewportWidth: 385,
      viewportHeight: 833,
      safeAreaInset: { top: 34.133335, bottom: 48, left: 0, right: 0 },
      contentSafeAreaInset: { top: 46.133335, bottom: 0, left: 0, right: 0 },
      visualBottomGap: 0
    });

    expect(calibration.topOffsetPx).toBe(74);
    expect(calibration.chatTopOffsetPx).toBe(90);
    expect(calibration.bottomOffsetPx).toBe(48);
    expect(calibration.source).toBe("android-wide");
  });

  it("uses iOS safe areas without Android-specific extra spacing", () => {
    const calibration = calculateLayoutCalibration({
      platform: "ios",
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      viewportWidth: 430,
      viewportHeight: 932,
      safeAreaInset: { top: 59, bottom: 34, left: 0, right: 0 },
      contentSafeAreaInset: { top: 70, bottom: 0, left: 0, right: 0 },
      visualBottomGap: 0
    });

    expect(calibration.topOffsetPx).toBe(86);
    expect(calibration.chatTopOffsetPx).toBe(104);
    expect(calibration.bottomOffsetPx).toBe(34);
    expect(calibration.source).toBe("ios");
  });

  it("keeps Samsung Android out of compact top mode", () => {
    const layout = getDeviceLayoutClasses({
      platform: "android",
      userAgent: "Mozilla/5.0 (Linux; Android 15; SM-S938B) SamsungBrowser"
    });

    expect(layout).toContain("club-android");
    expect(layout).toContain("club-samsung");
    expect(layout).not.toContain("club-android-compact-top");
  });

  it("uses compact top mode for non-Samsung Android WebViews", () => {
    const layout = getDeviceLayoutClasses({
      platform: "android",
      userAgent: "Mozilla/5.0 (Linux; Android 13; JLN-LX1) AppleWebKit/537.36"
    });

    expect(layout).toContain("club-android");
    expect(layout).toContain("club-huawei");
    expect(layout).toContain("club-android-compact-top");
  });

  it("detects iPhone separately from Android layout classes", () => {
    const layout = getDeviceLayoutClasses({
      platform: "ios",
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"
    });

    expect(layout).toContain("club-ios");
    expect(layout).not.toContain("club-android");
    expect(layout).not.toContain("club-android-compact-top");
  });

  it("adds size classes from measured viewport", () => {
    expect(getViewportSizeClasses({ width: 360, height: 760 })).toEqual([
      "club-screen-narrow",
      "club-screen-short"
    ]);
    expect(getViewportSizeClasses({ width: 430, height: 940 })).toEqual(["club-screen-tall"]);
  });

  it("uses the smallest live viewport height when Android Telegram keeps visualViewport stale", () => {
    const visibleHeight = getMeasuredVisibleViewportHeight({
      telegramHeight: 820,
      visualHeight: 796,
      browserHeight: 455
    });
    const keyboardBottomGap = getMeasuredKeyboardBottomGap({
      viewportBaseHeight: 820,
      visibleHeight,
      visibleOffsetTop: 0
    });

    expect(visibleHeight).toBe(455);
    expect(keyboardBottomGap).toBe(365);
  });

  it("collects copyable diagnostics from the current device", () => {
    const diagnostics = collectDeviceDiagnostics({
      platform: "android",
      colorScheme: "dark",
      userAgent: "Mozilla/5.0 (Linux; Android 13; JLN-LX1) AppleWebKit/537.36",
      screen: { width: 1080, height: 2388, availWidth: 1080, availHeight: 2290, pixelRatio: 2.75 },
      viewport: { width: 393, height: 851 },
      visualViewport: { width: 393, height: 740, offsetTop: 0, scale: 1 },
      telegram: {
        version: "8.0",
        platform: "android",
        viewportHeight: 851,
        viewportStableHeight: 851,
        safeAreaInset: { top: 0, bottom: 24, left: 0, right: 0 },
        contentSafeAreaInset: { top: 0, bottom: 24, left: 0, right: 0 }
      },
      classes: ["club-android", "club-huawei", "club-android-compact-top"]
    });

    expect(diagnostics).toMatchObject({
      platform: "android",
      colorScheme: "dark",
      userAgent: "Mozilla/5.0 (Linux; Android 13; JLN-LX1) AppleWebKit/537.36",
      screen: { width: 1080, height: 2388, pixelRatio: 2.75 },
      viewport: { width: 393, height: 851 },
      visualViewport: { height: 740, offsetTop: 0 },
      telegram: { platform: "android", viewportHeight: 851 },
      classes: ["club-android", "club-huawei", "club-android-compact-top"]
    });
  });
});
