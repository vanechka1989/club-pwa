import { describe, expect, it } from "vitest";
import {
  calculateLayoutCalibration,
  collectDeviceDiagnostics,
  createDeviceLayoutSnapshot,
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

  it("treats touch Android PWA with a physical screen-width viewport as a scaled mobile shell", () => {
    expect(
      getMobileDeviceShellScale({
        layoutWidth: 980,
        layoutHeight: 1914,
        screenWidth: 1080,
        screenAvailWidth: 1080,
        devicePixelRatio: 1,
        hasTouchInput: true,
        userAgent:
          "Mozilla/5.0 (Linux; Android 15; SM-S938B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36"
      })
    ).toEqual({ isMobileDeviceShell: true, scale: 2.513 });
  });

  it("treats standalone touch portrait PWA with desktop-like UA as a scaled mobile shell", () => {
    expect(
      getMobileDeviceShellScale({
        layoutWidth: 980,
        layoutHeight: 1914,
        screenWidth: 1080,
        screenAvailWidth: 1080,
        devicePixelRatio: 1,
        hasTouchInput: true,
        userAgent:
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36"
      })
    ).toEqual({ isMobileDeviceShell: true, scale: 2.513 });
  });

  it("treats Android mobile UA wide portrait PWA as mobile even when touch APIs report no touch", () => {
    expect(
      getMobileDeviceShellScale({
        layoutWidth: 980,
        layoutHeight: 1914,
        screenWidth: 980,
        screenAvailWidth: 980,
        devicePixelRatio: 1,
        hasTouchInput: false,
        isStandaloneDisplay: true,
        userAgent:
          "Mozilla/5.0 (Linux; Android 16; SM-S938B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36"
      })
    ).toEqual({ isMobileDeviceShell: true, scale: 2.513 });
  });

  it("treats standalone small-screen PWA with desktop-like UA and no touch signal as a scaled mobile shell", () => {
    expect(
      getMobileDeviceShellScale({
        layoutWidth: 980,
        layoutHeight: 1914,
        screenWidth: 385,
        screenAvailWidth: 385,
        devicePixelRatio: 3.75,
        hasTouchInput: false,
        isStandaloneDisplay: true,
        userAgent:
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36"
      })
    ).toEqual({ isMobileDeviceShell: true, scale: 2.545 });
  });

  it("creates a signed-out mobile PWA auth layout snapshot for wide Android viewports", () => {
    const snapshot = createDeviceLayoutSnapshot({
      layoutWidth: 980,
      viewportHeight: 851,
      screenWidth: 1080,
      screenAvailWidth: 1080,
      devicePixelRatio: 1,
      hasTouchInput: true,
      platform: "android",
      sessionMode: "signed-out",
      userAgent:
        "Mozilla/5.0 (Linux; Android 15; SM-S938B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36"
    });

    expect(snapshot.isMobileDeviceShell).toBe(true);
    expect(snapshot.scale).toBe(2.513);
    expect(snapshot.classes).toEqual(["club-android", "club-mobile-device", "club-mobile-auth-scaled"]);
    expect(snapshot.cssVariables).toMatchObject({
      "--club-auth-wide-viewport-scale": "2.513"
    });
    expect(snapshot.removedCssVariables).toEqual([
      "--club-app-wide-viewport-scale",
      "--club-app-wide-font-root",
      "--club-app-wide-font-base"
    ]);
  });

  it("creates a signed-in mobile PWA app layout snapshot for wide Android viewports", () => {
    const snapshot = createDeviceLayoutSnapshot({
      layoutWidth: 980,
      viewportHeight: 851,
      screenWidth: 1080,
      screenAvailWidth: 1080,
      devicePixelRatio: 1,
      hasTouchInput: true,
      platform: "android",
      sessionMode: "signed-in",
      userAgent:
        "Mozilla/5.0 (Linux; Android 15; SM-S938B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36"
    });

    expect(snapshot.isMobileDeviceShell).toBe(true);
    expect(snapshot.scale).toBe(2.513);
    expect(snapshot.classes).toEqual(["club-android", "club-mobile-device", "club-mobile-app-scaled"]);
    expect(snapshot.cssVariables).toMatchObject({
      "--club-app-wide-viewport-scale": "2.513",
      "--club-app-wide-font-root": "32.67px",
      "--club-app-wide-font-base": "32.67px"
    });
    expect(snapshot.removedCssVariables).toEqual(["--club-auth-wide-viewport-scale"]);
  });

  it("creates a signed-in mobile PWA app snapshot for desktop-like UA touch portrait shells", () => {
    const snapshot = createDeviceLayoutSnapshot({
      layoutWidth: 980,
      viewportHeight: 1914,
      screenWidth: 1080,
      screenAvailWidth: 1080,
      devicePixelRatio: 1,
      hasTouchInput: true,
      platform: "Linux x86_64",
      sessionMode: "signed-in",
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36"
    });

    expect(snapshot.isMobileDeviceShell).toBe(true);
    expect(snapshot.scale).toBe(2.513);
    expect(snapshot.classes).toEqual(["club-screen-tall", "club-mobile-device", "club-mobile-app-scaled"]);
    expect(snapshot.cssVariables).toMatchObject({
      "--club-app-wide-viewport-scale": "2.513"
    });
  });

  it("creates a signed-in mobile app snapshot for standalone desktop-UA small-screen PWA shells", () => {
    const snapshot = createDeviceLayoutSnapshot({
      layoutWidth: 980,
      viewportHeight: 1914,
      screenWidth: 385,
      screenAvailWidth: 385,
      devicePixelRatio: 3.75,
      hasTouchInput: false,
      isStandaloneDisplay: true,
      platform: "Linux armv81",
      sessionMode: "signed-in",
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36"
    });

    expect(snapshot.isMobileDeviceShell).toBe(true);
    expect(snapshot.scale).toBe(2.545);
    expect(snapshot.classes).toEqual(["club-screen-tall", "club-mobile-device", "club-mobile-app-scaled"]);
    expect(snapshot.cssVariables).toMatchObject({
      "--club-app-wide-viewport-scale": "2.545"
    });
  });

  it("keeps a real CSS-width mobile viewport unscaled while still using the mobile shell", () => {
    const snapshot = createDeviceLayoutSnapshot({
      layoutWidth: 393,
      viewportHeight: 851,
      screenWidth: 1080,
      screenAvailWidth: 1080,
      devicePixelRatio: 2.75,
      hasTouchInput: true,
      platform: "android",
      sessionMode: "signed-in",
      userAgent:
        "Mozilla/5.0 (Linux; Android 15; SM-S938B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36"
    });

    expect(snapshot.isMobileDeviceShell).toBe(true);
    expect(snapshot.scale).toBe(1);
    expect(snapshot.classes).toEqual(["club-android", "club-mobile-device"]);
    expect(snapshot.cssVariables).toEqual({});
    expect(snapshot.removedCssVariables).toEqual([
      "--club-auth-wide-viewport-scale",
      "--club-app-wide-viewport-scale",
      "--club-app-wide-font-root",
      "--club-app-wide-font-base"
    ]);
  });

  it("keeps desktop browser layouts out of the mobile shell adapter", () => {
    const snapshot = createDeviceLayoutSnapshot({
      layoutWidth: 1280,
      viewportHeight: 820,
      screenWidth: 1920,
      screenAvailWidth: 1920,
      devicePixelRatio: 1,
      hasTouchInput: false,
      platform: "Win32",
      sessionMode: "signed-in",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    });

    expect(snapshot.isMobileDeviceShell).toBe(false);
    expect(snapshot.scale).toBe(1);
    expect(snapshot.classes).toEqual([]);
    expect(snapshot.cssVariables).toEqual({});
    expect(snapshot.removedCssVariables).toEqual([
      "--club-auth-wide-viewport-scale",
      "--club-app-wide-viewport-scale",
      "--club-app-wide-font-root",
      "--club-app-wide-font-base"
    ]);
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
