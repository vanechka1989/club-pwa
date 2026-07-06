import { describe, expect, it } from "vitest";
import { detectInstallPlatform } from "./installPlatform";

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
    ).toBe("desktop");
  });
});
