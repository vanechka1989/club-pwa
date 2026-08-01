import { describe, expect, it } from "vitest";
import { scoreQuizAttempt, type StoredQuizRevision } from "./assessmentScoring";

const revision: StoredQuizRevision = {
  passingPercent: 70,
  questions: [
    { id: "single", type: "single_choice", points: 2, correctOptionIds: ["four"] },
    { id: "multiple", type: "multiple_choice", points: 3, correctOptionIds: ["a", "c"] },
    { id: "free", type: "free_text", points: 5, correctOptionIds: [] }
  ]
};

describe("scoreQuizAttempt", () => {
  it("scores single and multiple choice only for an exact correct selection", () => {
    const result = scoreQuizAttempt(
      { ...revision, questions: revision.questions.slice(0, 2) },
      [
        { questionId: "single", selectedOptionIds: ["four"], text: null },
        { questionId: "multiple", selectedOptionIds: ["c", "a"], text: null }
      ]
    );

    expect(result).toEqual({ earnedPoints: 5, maxPoints: 5, percent: 100, status: "passed", requiresReview: false });
    expect(scoreQuizAttempt(
      { ...revision, questions: revision.questions.slice(0, 2) },
      [
        { questionId: "single", selectedOptionIds: ["four", "five"], text: null },
        { questionId: "multiple", selectedOptionIds: ["a"], text: null }
      ]
    ).earnedPoints).toBe(0);
  });

  it("waits for manual points when a free-text answer exists", () => {
    const result = scoreQuizAttempt(revision, [
      { questionId: "single", selectedOptionIds: ["four"], text: null },
      { questionId: "multiple", selectedOptionIds: ["a", "c"], text: null },
      { questionId: "free", selectedOptionIds: [], text: "Объяснение" }
    ]);

    expect(result).toEqual({ earnedPoints: 5, maxPoints: 10, percent: 50, status: "pending_review", requiresReview: true });
  });

  it("includes bounded reviewed points and applies the configured threshold", () => {
    const answers = [
      { questionId: "single", selectedOptionIds: ["four"], text: null },
      { questionId: "multiple", selectedOptionIds: ["wrong"], text: null },
      { questionId: "free", selectedOptionIds: [], text: "Ответ" }
    ];

    expect(scoreQuizAttempt(revision, answers, { free: 5 })).toMatchObject({ earnedPoints: 7, percent: 70, status: "passed", requiresReview: false });
    expect(scoreQuizAttempt(revision, answers, { free: 99 }).earnedPoints).toBe(7);
    expect(scoreQuizAttempt(revision, answers, { free: -5 }).earnedPoints).toBe(2);
  });

  it("rounds the weighted percentage and treats missing answers as zero", () => {
    const result = scoreQuizAttempt(
      { passingPercent: 60, questions: revision.questions.slice(0, 2) },
      [{ questionId: "multiple", selectedOptionIds: ["a", "c"], text: null }]
    );

    expect(result).toEqual({ earnedPoints: 3, maxPoints: 5, percent: 60, status: "passed", requiresReview: false });
  });
});
