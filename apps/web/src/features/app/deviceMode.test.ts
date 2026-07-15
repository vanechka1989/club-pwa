import { describe, expect, it } from "vitest";
import {
  classifyDeviceMode,
  getDeviceModeNoticeKind,
  getSafeQrTarget,
  shouldForceMobilePresentation,
  type DeviceModeInput
} from "./deviceMode";

function device(overrides: Partial<DeviceModeInput>): DeviceModeInput {
  return {
    userAgent: "",
    platform: "",
    userAgentDataMobile: null,
    maxTouchPoints: 0,
    pointerCoarse: false,
    pointerFine: false,
    screenWidth: null,
    screenHeight: null,
    screenAvailWidth: null,
    screenAvailHeight: null,
    devicePixelRatio: 1,
    layoutWidth: 0,
    layoutHeight: 0,
    isStandaloneDisplay: false,
    ...overrides
  };
}

describe("classifyDeviceMode", () => {
  it("recognizes a normal Android phone", () => {
    const result = classifyDeviceMode(
      device({
        userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36",
        platform: "Linux armv8l",
        userAgentDataMobile: true,
        maxTouchPoints: 5,
        pointerCoarse: true,
        screenWidth: 1080,
        screenHeight: 2400,
        devicePixelRatio: 3,
        layoutWidth: 360,
        layoutHeight: 800
      })
    );

    expect(result.mode).toBe("mobile");
    expect(result.reasons).toContain("physical-phone");
  });

  it("recognizes Android desktop-site mode from a phone screen and wide viewport", () => {
    const result = classifyDeviceMode(
      device({
        userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126 Safari/537.36",
        platform: "Linux armv8l",
        userAgentDataMobile: false,
        maxTouchPoints: 5,
        pointerCoarse: true,
        screenWidth: 980,
        screenHeight: 2140,
        devicePixelRatio: 2.5,
        layoutWidth: 980,
        layoutHeight: 1740
      })
    );

    expect(result.mode).toBe("mobile-desktop");
    expect(result.reasons).toContain("desktop-browser-signals");
  });

  it("recognizes an iPhone using a desktop Safari identity", () => {
    const result = classifyDeviceMode(
      device({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15",
        platform: "MacIntel",
        maxTouchPoints: 5,
        pointerCoarse: true,
        screenWidth: 1170,
        screenHeight: 2532,
        devicePixelRatio: 3,
        layoutWidth: 980,
        layoutHeight: 1800
      })
    );

    expect(result.mode).toBe("mobile-desktop");
  });

  it("protects an iPad in desktop-site mode from a phone or desktop assumption", () => {
    const result = classifyDeviceMode(
      device({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15",
        platform: "MacIntel",
        maxTouchPoints: 5,
        pointerCoarse: true,
        screenWidth: 1024,
        screenHeight: 1366,
        devicePixelRatio: 2,
        layoutWidth: 1024,
        layoutHeight: 1366
      })
    );

    expect(result.mode).toBe("unknown");
    expect(result.reasons).toContain("tablet-protected");
  });

  it.each([
    ["Windows", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36", "Win32"],
    ["macOS", "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15", "MacIntel"],
    ["Linux", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36", "Linux x86_64"]
  ])("recognizes a %s desktop", (_label, userAgent, platform) => {
    const result = classifyDeviceMode(
      device({
        userAgent,
        platform,
        pointerFine: true,
        screenWidth: 1920,
        screenHeight: 1080,
        layoutWidth: 1440,
        layoutHeight: 900
      })
    );

    expect(result.mode).toBe("desktop");
  });

  it("keeps a large touch laptop classified as desktop", () => {
    const result = classifyDeviceMode(
      device({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
        platform: "Win32",
        maxTouchPoints: 10,
        pointerCoarse: true,
        pointerFine: true,
        screenWidth: 1920,
        screenHeight: 1200,
        layoutWidth: 1365,
        layoutHeight: 768
      })
    );

    expect(result.mode).toBe("desktop");
  });

  it("returns unknown when there are not enough trustworthy signals", () => {
    expect(classifyDeviceMode(device({ layoutWidth: 768, layoutHeight: 1024 })).mode).toBe("unknown");
  });
});

describe("device-mode presentation", () => {
  it("warns for browser desktop-site mode but not for an installed phone PWA", () => {
    expect(getDeviceModeNoticeKind("mobile-desktop", false)).toBe("mobile-desktop");
    expect(getDeviceModeNoticeKind("mobile-desktop", true)).toBeNull();
  });

  it("warns on actual desktop, including an installed desktop PWA", () => {
    expect(getDeviceModeNoticeKind("desktop", false)).toBe("desktop");
    expect(getDeviceModeNoticeKind("desktop", true)).toBe("desktop");
  });

  it("forces a mobile presentation for confident phone and desktop modes only", () => {
    expect(shouldForceMobilePresentation("mobile")).toBe(true);
    expect(shouldForceMobilePresentation("mobile-desktop")).toBe(true);
    expect(shouldForceMobilePresentation("desktop")).toBe(true);
    expect(shouldForceMobilePresentation("unknown")).toBe(false);
  });

  it("removes private routes, query parameters and hashes from the QR target", () => {
    expect(getSafeQrTarget("https://club.example/admin/clients/secret?token=private#ticket")).toBe("https://club.example/");
  });

  it("returns an empty QR target for an invalid address", () => {
    expect(getSafeQrTarget("not a url")).toBe("");
  });
});
