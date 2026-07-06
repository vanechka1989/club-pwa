import { describe, expect, it } from "vitest";
import {
  calculateLayoutCalibration,
  collectDeviceDiagnostics,
  getDeviceLayoutClasses,
  getMobileDeviceShellScale,
  getMeasuredKeyboardBottomGap,
  getMeasuredViewportWidth,
  getMeasuredVisibleViewportHeight,
  getViewportSizeClasses
} from "./deviceLayout";

describe("device layout detection", () => {
  it("keeps Android PWA calibration focused on the safe bottom area", () => {
    const calibration = calculateLayoutCalibration({
      platform: "android",
      userAgent:
        "Mozilla/5.0 (Linux; Android 12; K) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36",
      viewportWidth: 360,
      viewportHeight: 796,
      safeAreaInset: { top: 35.333332, bottom: 0, left: 0, right: 0 },
      contentSafeAreaInset: { top: 46, bottom: 0, left: 0, right: 0 },
      visualBottomGap: 0
    });

    expect(calibration.bottomOffsetPx).toBe(0);
    expect(calibration.source).toBe("android");
    expect(calibration).not.toHaveProperty("topOffsetPx");
    expect(calibration).not.toHaveProperty("chatTopOffsetPx");
  });

  it("uses the larger of safe-area and keyboard bottom gaps", () => {
    const calibration = calculateLayoutCalibration({
      platform: "android",
      userAgent:
        "Mozilla/5.0 (Linux; Android 16; K) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36",
      viewportWidth: 385,
      viewportHeight: 833,
      safeAreaInset: { top: 34.133335, bottom: 48, left: 0, right: 0 },
      contentSafeAreaInset: { top: 46.133335, bottom: 0, left: 0, right: 0 },
      visualBottomGap: 72
    });

    expect(calibration.bottomOffsetPx).toBe(72);
    expect(calibration.source).toBe("android");
  });

  it("uses iOS safe bottom areas without Android-specific extra spacing", () => {
    const calibration = calculateLayoutCalibration({
      platform: "ios",
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      viewportWidth: 430,
      viewportHeight: 932,
      safeAreaInset: { top: 59, bottom: 34, left: 0, right: 0 },
      contentSafeAreaInset: { top: 70, bottom: 0, left: 0, right: 0 },
      visualBottomGap: 0
    });

    expect(calibration.bottomOffsetPx).toBe(34);
    expect(calibration.source).toBe("ios");
  });

  it("does not create vendor-specific Android layout classes", () => {
    const layout = getDeviceLayoutClasses({
      platform: "android",
      userAgent: "Mozilla/5.0 (Linux; Android 15; SM-S938B) SamsungBrowser"
    });

    expect(layout).toEqual(["club-android"]);
    expect(layout).not.toContain("club-samsung");
    expect(layout).not.toContain("club-huawei");
    expect(layout).not.toContain("club-android-compact-top");
  });

  it("treats Chrome on Huawei/Honor as a normal Android PWA viewport", () => {
    const layout = getDeviceLayoutClasses({
      platform: "android",
      userAgent: "Mozilla/5.0 (Linux; Android 13; JLN-LX1) AppleWebKit/537.36"
    });

    expect(layout).toEqual(["club-android"]);
    expect(layout).not.toContain("club-huawei");
    expect(layout).not.toContain("club-android-compact-top");
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

  it("uses CSS viewport width instead of physical Android screen pixels", () => {
    const width = getMeasuredViewportWidth({
      browserWidth: 393,
      visualWidth: 393,
      screenWidth: 1080,
      screenAvailWidth: 1080,
      devicePixelRatio: 2.75
    });

    expect(width).toBe(393);
    expect(getViewportSizeClasses({ width, height: 851 })).toEqual([]);
  });

  it("uses a mobile device shell for touch phones and only scales desktop layout viewports", () => {
    expect(
      getMobileDeviceShellScale({
        layoutWidth: 393,
        screenWidth: 1080,
        screenAvailWidth: 1080,
        devicePixelRatio: 2.75,
        hasTouchInput: true
      })
    ).toEqual({ isMobileDeviceShell: true, scale: 1 });

    expect(
      getMobileDeviceShellScale({
        layoutWidth: 980,
        screenWidth: 1080,
        screenAvailWidth: 1080,
        devicePixelRatio: 2.75,
        hasTouchInput: true
      })
    ).toEqual({ isMobileDeviceShell: true, scale: 2.495 });
  });

  it("uses the smallest live viewport height when mobile browsers expose stale visualViewport values", () => {
    const visibleHeight = getMeasuredVisibleViewportHeight({
      appHeight: 820,
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
      browser: {
        displayMode: "standalone",
        standalone: true,
        safeAreaInset: { top: 0, bottom: 24, left: 0, right: 0 }
      },
      layoutCalibration: { bottomOffsetPx: 24, source: "android" },
      classes: ["club-android"]
    });

    expect(diagnostics).toMatchObject({
      platform: "android",
      colorScheme: "dark",
      userAgent: "Mozilla/5.0 (Linux; Android 13; JLN-LX1) AppleWebKit/537.36",
      screen: { width: 1080, height: 2388, pixelRatio: 2.75 },
      viewport: { width: 393, height: 851 },
      visualViewport: { height: 740, offsetTop: 0 },
      browser: { displayMode: "standalone", standalone: true },
      layoutCalibration: { bottomOffsetPx: 24, source: "android" },
      classes: ["club-android"]
    });
  });
});
