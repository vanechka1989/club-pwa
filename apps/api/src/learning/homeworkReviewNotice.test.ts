import { describe, expect, it } from "vitest";
import { serializeHomeworkReviewNotice } from "./homeworkReviewNotice";

describe("serializeHomeworkReviewNotice", () => {
  it.each(["needs_revision", "accepted"] as const)("serializes a reviewed %s homework submission", (status) => {
    expect(serializeHomeworkReviewNotice({
      contentItemId: "lesson-1",
      status,
      reviewedAt: new Date("2026-08-02T16:40:00.000Z"),
      reviewComment: "Добавьте пример"
    })).toEqual({
      contentItemId: "lesson-1",
      status,
      reviewComment: "Добавьте пример",
      reviewedAt: "2026-08-02T16:40:00.000Z"
    });
  });

  it("ignores rows without a completed review decision", () => {
    expect(serializeHomeworkReviewNotice({
      contentItemId: "lesson-1",
      status: "pending_review",
      reviewedAt: null,
      reviewComment: null
    })).toBeNull();
  });
});
