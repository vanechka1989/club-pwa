import { describe, expect, it } from "vitest";
import { detectInstallPlatform, getInstallGuide } from "./installPlatform";

describe("install platform detection", () => {
  it("detects iPhone Safari user agents", () => {
    expect(
      detectInstallPlatform({
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
        platform: "iPhone",
        maxTouchPoints: 5
      }).kind
    ).toBe("ios");
  });

  it("detects touch iPads that report MacIntel", () => {
    expect(
      detectInstallPlatform({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15",
        platform: "MacIntel",
        maxTouchPoints: 5
      }).kind
    ).toBe("ios");
  });

  it("detects Android browsers separately from desktop browsers", () => {
    expect(
      detectInstallPlatform({
        userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36",
        platform: "Linux armv8l",
        maxTouchPoints: 5
      }).kind
    ).toBe("android");

    expect(
      detectInstallPlatform({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36",
        platform: "Win32",
        maxTouchPoints: 0
      }).kind
    ).toBe("windows");
  });

  it("keeps touch Android Chrome on Android instructions even with reduced user agent details", () => {
    expect(
      detectInstallPlatform({
        userAgent: "Mozilla/5.0 AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36",
        platform: "Linux armv8l",
        maxTouchPoints: 5,
        userAgentData: {
          mobile: true,
          platform: "Android"
        },
        viewportWidth: 393
      }).kind
    ).toBe("android");

    expect(
      detectInstallPlatform({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36",
        platform: "Win32",
        maxTouchPoints: 10,
        userAgentData: {
          mobile: false,
          platform: "Windows"
        },
        viewportWidth: 640
      }).kind
    ).toBe("windows");
  });

  it("detects macOS desktop browsers separately from iPadOS", () => {
    expect(
      detectInstallPlatform({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 Chrome/126.0 Safari/537.36",
        platform: "MacIntel",
        maxTouchPoints: 0
      }).kind
    ).toBe("macos");
  });

  it("builds platform-specific installation guides", () => {
    expect(getInstallGuide({ kind: "ios", isIos: true, isAndroid: false, isWindows: false, isMacOs: false }).primarySteps.join(" ")).toContain(
      "Safari"
    );
    expect(
      getInstallGuide({ kind: "android", isIos: false, isAndroid: true, isWindows: false, isMacOs: false }).primarySteps.join(" ")
    ).toContain("Добавить на главный экран");
    expect(
      getInstallGuide({ kind: "windows", isIos: false, isAndroid: false, isWindows: true, isMacOs: false }).cards.map((card) => card.title)
    ).toContain("Edge Windows");
    expect(
      getInstallGuide({ kind: "macos", isIos: false, isAndroid: false, isWindows: false, isMacOs: true }).cards.map((card) => card.title)
    ).toContain("Safari macOS");
  });
});
