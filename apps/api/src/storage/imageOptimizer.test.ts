import { describe, expect, it } from "vitest";
import { getOptimizedImageFileName, shouldOptimizeImageContentType } from "./imageOptimizer";

describe("image upload optimization", () => {
  it("optimizes jpeg and png images but leaves webp untouched", () => {
    expect(shouldOptimizeImageContentType("image/jpeg")).toBe(true);
    expect(shouldOptimizeImageContentType("image/png")).toBe(true);
    expect(shouldOptimizeImageContentType("image/webp")).toBe(false);
    expect(shouldOptimizeImageContentType("video/mp4")).toBe(false);
  });

  it("stores optimized images with a webp extension", () => {
    expect(getOptimizedImageFileName("Payment Screen.PNG")).toBe("Payment Screen.webp");
    expect(getOptimizedImageFileName("photo")).toBe("photo.webp");
  });
});
