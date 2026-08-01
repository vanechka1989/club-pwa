import type { QuizQuestionType } from "@club/shared";

export type StoredQuizQuestion = {
  id: string;
  type: QuizQuestionType;
  points: number;
  correctOptionIds: string[];
};

export type StoredQuizRevision = {
  passingPercent: number;
  questions: StoredQuizQuestion[];
};

export type StoredQuizAnswer = {
  questionId: string;
  selectedOptionIds: string[];
  text: string | null;
};

export type QuizScoreResult = {
  earnedPoints: number;
  maxPoints: number;
  percent: number;
  status: "passed" | "failed" | "pending_review";
  requiresReview: boolean;
};

function sameIdSet(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  const uniqueLeft = new Set(left);
  const uniqueRight = new Set(right);
  return uniqueLeft.size === uniqueRight.size && [...uniqueLeft].every((id) => uniqueRight.has(id));
}

function scoreAutomaticQuestion(question: StoredQuizQuestion, answer: StoredQuizAnswer | undefined) {
  if (question.type === "free_text" || !answer) return 0;
  return sameIdSet(answer.selectedOptionIds, question.correctOptionIds) ? question.points : 0;
}

export function scoreQuizAttempt(
  revision: StoredQuizRevision,
  answers: StoredQuizAnswer[],
  reviewedFreeTextPoints: Record<string, number> = {}
): QuizScoreResult {
  const answersByQuestion = new Map(answers.map((answer) => [answer.questionId, answer]));
  const freeTextQuestions = revision.questions.filter((question) => question.type === "free_text");
  const requiresReview = freeTextQuestions.some((question) => reviewedFreeTextPoints[question.id] === undefined);
  const maxPoints = revision.questions.reduce((total, question) => total + question.points, 0);
  const earnedPoints = revision.questions.reduce((total, question) => {
    if (question.type !== "free_text") {
      return total + scoreAutomaticQuestion(question, answersByQuestion.get(question.id));
    }
    const reviewedPoints = reviewedFreeTextPoints[question.id];
    if (reviewedPoints === undefined) return total;
    return total + Math.max(0, Math.min(question.points, reviewedPoints));
  }, 0);
  const percent = maxPoints > 0 ? Math.round((earnedPoints / maxPoints) * 100) : 0;

  return {
    earnedPoints,
    maxPoints,
    percent,
    status: requiresReview ? "pending_review" : percent >= revision.passingPercent ? "passed" : "failed",
    requiresReview
  };
}
