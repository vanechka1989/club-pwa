import { describe, expect, it } from "vitest";
import { serializeLearningProgressRows } from "./learningProgress";

describe("serializeLearningProgressRows", () => {
  it("returns unique started and completed lesson ids", () => {
    expect(serializeLearningProgressRows([
      { contentItemId: "lesson-1", completedAt: null },
      { contentItemId: "lesson-2", completedAt: new Date("2026-08-01T00:00:00Z") },
      { contentItemId: "lesson-2", completedAt: new Date("2026-08-01T00:00:00Z") }
    ])).toEqual({
      startedItemIds: ["lesson-1", "lesson-2"],
      completedItemIds: ["lesson-2"]
    });
  });
});
