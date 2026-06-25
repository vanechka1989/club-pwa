import { describe, expect, it } from "vitest";
import { learningContentSchema } from "./index";

describe("learningContentSchema", () => {
  it("accepts a nullable thumbnail URL", () => {
    const parsed = learningContentSchema.parse({
      id: "item-1",
      categoryId: "category-1",
      kind: "video",
      title: "Видео",
      summary: null,
      body: null,
      mediaUrl: "https://example.com/video.mp4",
      thumbnailUrl: "https://example.com/cover.jpg",
      mediaContentType: "video/mp4",
      mediaSizeBytes: 1024,
      publishedAt: null
    });

    expect(parsed.thumbnailUrl).toBe("https://example.com/cover.jpg");
  });
});
