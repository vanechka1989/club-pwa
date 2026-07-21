import { describe, expect, it } from "vitest";
import { mergeEngagementCounters, summarizeLearningEngagement, summarizeLearningEngagementUsers } from "./engagement";

const session = (overrides: Record<string, unknown> = {}) => ({
  sessionId: "00000000-0000-4000-8000-000000000001",
  userId: "user-1",
  contentItemId: "item-1",
  title: "Карточка 1",
  categoryTitle: "Модуль 1",
  activeSeconds: 20,
  videoSeconds: 10,
  playbackPositionSeconds: 30,
  openedAt: new Date("2026-07-21T10:00:00.000Z"),
  lastActivityAt: new Date("2026-07-21T10:00:20.000Z"),
  closedAt: null,
  completed: false,
  displayName: "Иван",
  email: "ivan@example.com",
  ...overrides
});

describe("learning engagement", () => {
  it("keeps cumulative counters idempotent and caps one session at one day", () => {
    expect(mergeEngagementCounters(
      { activeSeconds: 30, videoSeconds: 12, playbackPositionSeconds: 40 },
      { activeSeconds: 20, videoSeconds: 50, playbackPositionSeconds: 35 }
    )).toEqual({ activeSeconds: 30, videoSeconds: 30, playbackPositionSeconds: 40 });

    expect(mergeEngagementCounters(
      { activeSeconds: 0, videoSeconds: 0, playbackPositionSeconds: 0 },
      { activeSeconds: 100_000, videoSeconds: 100_000, playbackPositionSeconds: 100_000 }
    )).toEqual({ activeSeconds: 86_400, videoSeconds: 86_400, playbackPositionSeconds: 86_400 });
  });

  it("summarizes views, unique viewers, median time and quick exits by card", () => {
    const result = summarizeLearningEngagement([
      session({ activeSeconds: 2 }),
      session({ sessionId: "00000000-0000-4000-8000-000000000002", activeSeconds: 20 }),
      session({ sessionId: "00000000-0000-4000-8000-000000000003", userId: "user-2", activeSeconds: 40, completed: true })
    ]);

    expect(result.summary).toEqual({ uniqueViewers: 2, views: 3, medianActiveSeconds: 20, quickExitPercent: 33 });
    expect(result.cards[0]).toMatchObject({
      contentItemId: "item-1",
      viewers: 2,
      views: 3,
      engagedViews: 2,
      averageActiveSeconds: 21,
      medianActiveSeconds: 20,
      quickExits: 1,
      quickExitPercent: 33,
      completedUsers: 1
    });
  });

  it("groups selected-card sessions into member drilldowns", () => {
    const rows = summarizeLearningEngagementUsers([
      session(),
      session({ sessionId: "00000000-0000-4000-8000-000000000002", activeSeconds: 40, lastActivityAt: new Date("2026-07-21T11:00:00.000Z"), completed: true }),
      session({ sessionId: "00000000-0000-4000-8000-000000000003", userId: "user-2", displayName: "Анна", email: null, activeSeconds: 5 })
    ]);

    expect(rows[0]).toMatchObject({ userId: "user-1", displayName: "Иван", opens: 2, totalActiveSeconds: 60, completed: true });
    expect(rows[0]?.lastViewedAt).toBe("2026-07-21T11:00:00.000Z");
    expect(rows[1]).toMatchObject({ userId: "user-2", opens: 1, totalActiveSeconds: 5 });
  });
});
