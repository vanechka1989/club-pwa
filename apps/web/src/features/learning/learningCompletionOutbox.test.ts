import { describe, expect, it } from "vitest";
import { mergeLearningCompletionOutbox, removeDeliveredLearningCompletion } from "./learningCompletionOutbox";

describe("learning completion outbox", () => {
  it("keeps one retry entry per content item", () => {
    expect(mergeLearningCompletionOutbox([{ contentItemId: "lesson-1" }], "lesson-1")).toEqual([{ contentItemId: "lesson-1" }]);
    expect(mergeLearningCompletionOutbox([{ contentItemId: "lesson-1" }], "lesson-2")).toEqual([
      { contentItemId: "lesson-1" },
      { contentItemId: "lesson-2" }
    ]);
  });

  it("removes only the delivered item", () => {
    expect(removeDeliveredLearningCompletion(
      [{ contentItemId: "lesson-1" }, { contentItemId: "lesson-2" }],
      "lesson-1"
    )).toEqual([{ contentItemId: "lesson-2" }]);
  });
});
