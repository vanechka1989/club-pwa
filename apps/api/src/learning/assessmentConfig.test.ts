import { describe, expect, it } from "vitest";
import type { LessonAssessmentDraft } from "@club/shared";
import { buildStoredAssessment, toPublicAssessment } from "./assessmentConfig";

const quiz: LessonAssessmentDraft = {
  mode: "quiz",
  title: "Итоговый тест",
  instructions: "Ответьте на вопросы",
  passingPercent: 80,
  maxAttempts: 2,
  questions: [{
    id: "question-1",
    type: "single_choice",
    prompt: "Верный вариант?",
    points: 5,
    options: [{ id: "option-1", text: "Да" }, { id: "option-2", text: "Нет" }],
    correctOptionIds: ["option-1"]
  }]
};

describe("lesson assessment configuration", () => {
  it("normalizes a private draft into revision, questions and options", () => {
    const stored = buildStoredAssessment(quiz);

    expect(stored.revision.mode).toBe("quiz");
    expect(stored.questions[0]?.stableKey).toBe("question-1");
    expect(stored.questions[0]?.options[0]).toMatchObject({ stableKey: "option-1", isCorrect: true });
  });

  it("never exposes correct answers to a learner", () => {
    const publicConfig = toPublicAssessment(quiz);

    expect(publicConfig.mode).toBe("quiz");
    expect(JSON.stringify(publicConfig)).not.toContain("correctOptionIds");
  });
});
