import { describe, expect, it } from "vitest";
import { learningContentSchema, learningHomeResponseSchema } from "./index";

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
      cardLayout: "vertical",
      mediaContentType: "video/mp4",
      mediaSizeBytes: 1024,
      publishedAt: null
    });

    expect(parsed.thumbnailUrl).toBe("https://example.com/cover.jpg");
  });
});

describe("learningHomeResponseSchema", () => {
  it("keeps playback position for the last opened item", () => {
    const parsed = learningHomeResponseSchema.parse({
      categories: [],
      featured: [],
      progress: {
        totalItems: 1,
        completedItems: 0,
        lastOpenedItem: {
          id: "item-1",
          categoryId: "category-1",
          kind: "video",
          title: "Видео",
          summary: null,
          body: null,
          mediaUrl: "https://example.com/video.mp4",
          thumbnailUrl: null,
          cardLayout: "horizontal",
          mediaContentType: "video/mp4",
          mediaSizeBytes: 1024,
          publishedAt: null
        },
        lastOpenedAt: "2026-06-26T05:00:00.000Z",
        lastOpenedPlaybackPositionSeconds: 252
      }
    });

    expect(parsed.progress.lastOpenedPlaybackPositionSeconds).toBe(252);
  });
});
