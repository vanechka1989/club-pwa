import { describe, expect, it } from "vitest";
import { dismissOwnedHomeworkReview } from "./homeworkReviewDismissal";

function createRepository(ownedSubmissionIds: string[]) {
  const dismissed: Array<{ userId: string; submissionId: string }> = [];
  return {
    dismissed,
    repository: {
      async ownsReviewedSubmission(userId: string, submissionId: string) {
        return userId === "user-1" && ownedSubmissionIds.includes(submissionId);
      },
      async persistDismissal(userId: string, submissionId: string) {
        if (!dismissed.some((item) => item.userId === userId && item.submissionId === submissionId)) {
          dismissed.push({ userId, submissionId });
        }
      }
    }
  };
}

describe("dismissOwnedHomeworkReview", () => {
  it("persists only the selected review owned by the current user", async () => {
    const state = createRepository(["submission-1", "submission-2"]);

    expect(await dismissOwnedHomeworkReview({ userId: "user-1", submissionId: "submission-2" }, state.repository)).toBe(true);
    expect(state.dismissed).toEqual([{ userId: "user-1", submissionId: "submission-2" }]);
  });

  it("does not reveal or dismiss another user's submission", async () => {
    const state = createRepository(["submission-1"]);

    expect(await dismissOwnedHomeworkReview({ userId: "user-2", submissionId: "submission-1" }, state.repository)).toBe(false);
    expect(state.dismissed).toEqual([]);
  });

  it("is idempotent when the same review is dismissed twice", async () => {
    const state = createRepository(["submission-1"]);

    await dismissOwnedHomeworkReview({ userId: "user-1", submissionId: "submission-1" }, state.repository);
    await dismissOwnedHomeworkReview({ userId: "user-1", submissionId: "submission-1" }, state.repository);

    expect(state.dismissed).toEqual([{ userId: "user-1", submissionId: "submission-1" }]);
  });
});
