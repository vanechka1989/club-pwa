import { describe, expect, it } from "vitest";
import { serializeHomeworkReviewNotice } from "./homeworkReviewNotice";

describe("serializeHomeworkReviewNotice", () => {
  it.each(["needs_revision", "accepted"] as const)("serializes a reviewed %s homework submission", (status) => {
    expect(serializeHomeworkReviewNotice({
      submissionId: "submission-1",
      contentItemId: "lesson-1",
      status,
      reviewedAt: new Date("2026-08-02T16:40:00.000Z"),
      reviewComment: "Добавьте пример"
    })).toEqual({
      submissionId: "submission-1",
      contentItemId: "lesson-1",
      status,
      reviewComment: "Добавьте пример",
      reviewedAt: "2026-08-02T16:40:00.000Z"
    });
  });

  it("ignores rows without a completed review decision", () => {
    expect(serializeHomeworkReviewNotice({
      submissionId: "submission-1",
      contentItemId: "lesson-1",
      status: "pending_review",
      reviewedAt: null,
      reviewComment: null
    })).toBeNull();
  });

  it("keeps separate reviewed submissions as separate notices", () => {
    const rows = [
      { submissionId: "submission-2", contentItemId: "lesson-2", status: "accepted", reviewedAt: new Date("2026-08-03T00:00:00.000Z"), reviewComment: "Принято" },
      { submissionId: "submission-1", contentItemId: "lesson-1", status: "needs_revision", reviewedAt: new Date("2026-08-02T00:00:00.000Z"), reviewComment: "Исправьте пример" }
    ];

    expect(rows.map(serializeHomeworkReviewNotice)).toEqual([
      { submissionId: "submission-2", contentItemId: "lesson-2", status: "accepted", reviewComment: "Принято", reviewedAt: "2026-08-03T00:00:00.000Z" },
      { submissionId: "submission-1", contentItemId: "lesson-1", status: "needs_revision", reviewComment: "Исправьте пример", reviewedAt: "2026-08-02T00:00:00.000Z" }
    ]);
  });
});
