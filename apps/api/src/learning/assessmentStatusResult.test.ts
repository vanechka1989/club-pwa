import { describe, expect, it } from "vitest";
import { buildQuizAttemptReview } from "./assessmentStatusResult";

const questions = [
  {
    id: "question-1",
    type: "single_choice" as const,
    prompt: "Сколько будет 2 + 2?",
    points: 2,
    optionsSnapshot: [
      { id: "three", text: "3" },
      { id: "four", text: "4" }
    ],
    correctOptionIds: ["four"],
    sortOrder: 0
  }
];

const answers = [{
  questionSnapshotId: "question-1",
  selectedOptionIds: ["three"],
  text: null,
  reviewedPoints: null
}];

describe("buildQuizAttemptReview", () => {
  it("does not expose correct answers while an attempt is in progress", () => {
    expect(buildQuizAttemptReview("in_progress", questions, answers)).toBeUndefined();
  });

  it("returns an owned submitted attempt breakdown with awarded points", () => {
    expect(buildQuizAttemptReview("failed", questions, answers)).toEqual([{
      id: "question-1",
      type: "single_choice",
      prompt: "Сколько будет 2 + 2?",
      points: 2,
      optionsSnapshot: [
        { id: "three", text: "3" },
        { id: "four", text: "4" }
      ],
      selectedOptionIds: ["three"],
      text: null,
      correctOptionIds: ["four"],
      earnedPoints: 0,
      isCorrect: false
    }]);
  });

  it("never awards points to an unanswered malformed choice question", () => {
    expect(buildQuizAttemptReview("failed", [{ ...questions[0]!, correctOptionIds: [] }], [])?.[0]).toMatchObject({
      earnedPoints: 0,
      isCorrect: false
    });
  });
});
