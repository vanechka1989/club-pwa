import { describe, expect, it } from "vitest";
import {
  hashAcquisitionVisitorId,
  isSameAcquisitionWindow,
  buildAcquisitionAid,
  buildAcquisitionShortUrl,
  buildAcquisitionTrackedUrl,
  normalizeAcquisitionDestination,
  normalizeAcquisitionLabel
} from "./acquisition";

describe("acquisition helpers", () => {
  it("normalizes labels and safe destinations", () => {
    expect(normalizeAcquisitionLabel("  Telegram Ads  ")).toBe("telegram-ads");
    expect(normalizeAcquisitionLabel(" ")).toBeNull();
    expect(normalizeAcquisitionDestination({ kind: "billing" })).toEqual({ kind: "billing" });
    expect(normalizeAcquisitionDestination({ kind: "module", moduleId: "f08ac73a-4ca1-4ed2-b6c2-47cd32b45290" })).toEqual({ kind: "module", moduleId: "f08ac73a-4ca1-4ed2-b6c2-47cd32b45290" });
    expect(normalizeAcquisitionDestination({ kind: "https://evil.example" })).toEqual({ kind: "home" });
  });

  it("hashes visitor ids with domain separation", () => {
    expect(hashAcquisitionVisitorId("visitor-1", "secret")).toBe(hashAcquisitionVisitorId("visitor-1", "secret"));
    expect(hashAcquisitionVisitorId("visitor-1", "secret")).not.toBe(hashAcquisitionVisitorId("visitor-2", "secret"));
    expect(hashAcquisitionVisitorId("visitor-1", "secret")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("uses a 30 minute visit window", () => {
    const start = new Date("2026-07-21T00:00:00.000Z");
    expect(isSameAcquisitionWindow(start, new Date("2026-07-21T00:29:59.000Z"))).toBe(true);
    expect(isSameAcquisitionWindow(start, new Date("2026-07-21T00:30:00.000Z"))).toBe(false);
  });

  it("builds readable collision-resistant public ids", () => {
    expect(buildAcquisitionAid("Telegram July", "abc123")).toBe("telegram-july-abc123");
    expect(buildAcquisitionAid("   ", "abc123")).toBe("link-abc123");
    expect(buildAcquisitionAid("Пост у Кати", "abc123")).toBe("link-abc123");
  });

  it("builds both direct and short public URLs", () => {
    const link = { aid: "salebot", source: "salebot", medium: "", campaign: "", content: null };
    expect(buildAcquisitionShortUrl("https://club.example", link.aid)).toBe("https://club.example/go/salebot");
    expect(buildAcquisitionTrackedUrl("https://club.example", link)).toBe("https://club.example/?aid=salebot&utm_source=salebot");
  });
});
