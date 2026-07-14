import { describe, expect, it } from "vitest";
import { resolveLessonCoverUrl } from "./lessonCover";

describe("resolveLessonCoverUrl", () => {
  const fallback = "/previews/default-lessons/midnight-horizontal.webp";

  it("respects standard, custom and first-material modes", () => {
    expect(resolveLessonCoverUrl({ coverMode: "default", thumbnailUrl: "https://example.com/custom.webp", coverSourceUrl: "https://example.com/first.webp" }, fallback)).toBe(fallback);
    expect(resolveLessonCoverUrl({ coverMode: "custom", thumbnailUrl: "https://example.com/custom.webp", coverSourceUrl: "https://example.com/first.webp" }, fallback)).toBe("https://example.com/custom.webp");
    expect(resolveLessonCoverUrl({ coverMode: "first_material", thumbnailUrl: "https://example.com/custom.webp", coverSourceUrl: "https://example.com/first.webp" }, fallback)).toBe("https://example.com/first.webp");
  });

  it("falls back to the standard cover when the selected source is unavailable", () => {
    expect(resolveLessonCoverUrl({ coverMode: "custom", thumbnailUrl: null, coverSourceUrl: null }, fallback)).toBe(fallback);
    expect(resolveLessonCoverUrl({ coverMode: "first_material", thumbnailUrl: null, coverSourceUrl: null }, fallback)).toBe(fallback);
  });
});
