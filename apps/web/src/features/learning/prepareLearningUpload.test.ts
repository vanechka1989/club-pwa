import { describe, expect, it } from "vitest";
import { getLearningImageConversion, toWebpFileName } from "./prepareLearningUpload";

describe("learning image upload preparation", () => {
  it("converts JPEG and PNG lesson photos uploaded through the direct route", () => {
    expect(getLearningImageConversion({ purpose: "media", kind: "photo", contentType: "image/jpeg" })).toEqual({
      maxDimension: 1920,
      quality: 0.84
    });
    expect(getLearningImageConversion({ purpose: "media", kind: "photo", contentType: "image/png" })).toEqual({
      maxDimension: 1920,
      quality: 0.84
    });
  });

  it("converts lesson thumbnails but preserves audio and already optimized images", () => {
    expect(getLearningImageConversion({ purpose: "thumbnail", kind: "audio", contentType: "image/jpeg" })).toEqual({
      maxDimension: 1200,
      quality: 0.84
    });
    expect(getLearningImageConversion({ purpose: "media", kind: "audio", contentType: "audio/mpeg" })).toBeNull();
    expect(getLearningImageConversion({ purpose: "media", kind: "photo", contentType: "image/webp" })).toBeNull();
  });

  it("replaces the original image extension without adding a second extension", () => {
    expect(toWebpFileName("photo.JPG")).toBe("photo.webp");
    expect(toWebpFileName("cover.with.dots.png")).toBe("cover.with.dots.webp");
  });
});
