import { describe, expect, it } from "vitest";
import { learningEngagementResponseSchema, learningEngagementUsersResponseSchema, learningEngagementSnapshotSchema } from "./index";

describe("learning engagement contracts", () => {
  it("accepts cumulative member snapshots", () => {
    expect(learningEngagementSnapshotSchema.parse({
      sessionId: "00000000-0000-4000-8000-000000000001",
      activeSeconds: 15,
      videoSeconds: 10,
      playbackPositionSeconds: 42,
      materialId: null,
      closed: false
    }).activeSeconds).toBe(15);
  });

  it("accepts admin summary and user drilldown responses", () => {
    expect(learningEngagementResponseSchema.parse({ summary: { uniqueViewers: 0, views: 0, medianActiveSeconds: 0, quickExitPercent: 0 }, cards: [] }).cards).toEqual([]);
    expect(learningEngagementUsersResponseSchema.parse({ item: { id: "item-1", title: "Урок", categoryTitle: "Модуль" }, users: [] }).users).toEqual([]);
  });
});
