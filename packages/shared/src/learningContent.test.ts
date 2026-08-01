import { describe, expect, it } from "vitest";
import { adminLearningResponseSchema, learningCategorySchema, learningContentSchema, learningFavoriteMutationResponseSchema, learningHomeResponseSchema, learningProgressSummarySchema } from "./index";

describe("learningContentSchema", () => {
  it("accepts all lesson cover modes while keeping old content compatible", () => {
    const base = {
      id: "item-cover",
      categoryId: "category-1",
      kind: "text" as const,
      title: "Урок",
      summary: null,
      body: null,
      mediaUrl: null,
      thumbnailUrl: null,
      cardLayout: "vertical" as const,
      mediaContentType: null,
      mediaSizeBytes: null,
      publishedAt: null
    };

    expect(learningContentSchema.parse(base).coverMode).toBeUndefined();
    expect(learningContentSchema.parse({ ...base, coverMode: "custom" }).coverMode).toBe("custom");
    expect(learningContentSchema.parse({ ...base, coverMode: "first_material" }).coverMode).toBe("first_material");
    expect(() => learningContentSchema.parse({ ...base, coverMode: "unknown" })).toThrow();
  });

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
  it("keeps old progress responses compatible and exposes lesson status ids", () => {
    const parsed = learningProgressSummarySchema.parse({
      totalItems: 2,
      completedItems: 0,
      lastOpenedItem: null,
      lastOpenedAt: null,
      lastOpenedPlaybackPositionSeconds: 0
    });

    expect(parsed.startedItemIds).toBeUndefined();
    expect(parsed.completedItemIds).toBeUndefined();
    expect(parsed.favoriteItemIds).toEqual([]);
  });

  it("accepts favorite mutation responses", () => {
    expect(learningFavoriteMutationResponseSchema.parse({ ok: true, favorite: true })).toEqual({ ok: true, favorite: true });
  });
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

describe("learning administration archive contracts", () => {
  const category = {
    id: "category-1",
    slug: "module-1",
    title: "Модуль 1",
    description: null,
    isPublished: false,
    itemsCount: 0
  };

  it("keeps legacy learning categories compatible when archive state is absent", () => {
    expect(learningCategorySchema.parse(category).archivedUntil).toBeUndefined();
  });

  it("keeps legacy admin learning responses compatible by defaulting deleted categories", () => {
    const parsed = adminLearningResponseSchema.parse({
      categories: [category],
      materials: []
    });

    expect(parsed.deletedCategories).toEqual([]);
    expect(parsed.categories[0]?.archivedUntil).toBeUndefined();
  });
});
