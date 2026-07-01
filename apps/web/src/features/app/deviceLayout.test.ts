import { describe, expect, it } from "vitest";
import { getDeviceLayoutClasses, getViewportSizeClasses } from "./deviceLayout";

describe("device layout detection", () => {
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
});
