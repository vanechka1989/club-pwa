import { describe, expect, it } from "vitest";
import { mergeLearningEngagementOutbox, removeDeliveredLearningEngagement } from "./learningEngagementOutbox";

describe("learning engagement offline outbox", () => {
  it("keeps the highest cumulative counters for one session", () => {
    const previous = [{ contentItemId: "lesson-1", snapshot: { sessionId: "00000000-0000-4000-8000-000000000001", activeSeconds: 15, videoSeconds: 5, playbackPositionSeconds: 20, materialId: null, closed: false } }];
    const merged = mergeLearningEngagementOutbox(previous, { contentItemId: "lesson-1", snapshot: { ...previous[0]!.snapshot, activeSeconds: 30, videoSeconds: 10, closed: true } });
    expect(merged).toHaveLength(1);
    expect(merged[0]?.snapshot).toMatchObject({ activeSeconds: 30, videoSeconds: 10, closed: true });
  });

  it("does not remove a fresher snapshot that arrived during delivery", () => {
    const delivered = { contentItemId: "lesson-1", snapshot: { sessionId: "00000000-0000-4000-8000-000000000001", activeSeconds: 15, videoSeconds: 5, playbackPositionSeconds: 20, materialId: null, closed: false } };
    const fresher = { contentItemId: "lesson-1", snapshot: { ...delivered.snapshot, activeSeconds: 30, videoSeconds: 10, closed: true } };

    expect(removeDeliveredLearningEngagement([fresher], delivered)).toEqual([fresher]);
    expect(removeDeliveredLearningEngagement([delivered], delivered)).toEqual([]);
  });
});
