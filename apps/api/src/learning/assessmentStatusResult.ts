type ReviewQuestion = {
  id: string;
  type: string;
  prompt: string;
  points: number;
  optionsSnapshot: Array<{ id: string; text: string }>;
  correctOptionIds: string[];
  sortOrder: number;
};

type ReviewAnswer = {
  questionSnapshotId: string;
  selectedOptionIds: string[];
  text: string | null;
  reviewedPoints: number | null;
};

function sameIds(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  const rightIds = new Set(right);
  return left.every((id) => rightIds.has(id));
}

export function buildQuizAttemptReview(status: string, questions: ReviewQuestion[], answers: ReviewAnswer[]) {
  if (status === "in_progress") return undefined;

  const answersByQuestion = new Map(answers.map((answer) => [answer.questionSnapshotId, answer]));
  return [...questions]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((question) => {
      const answer = answersByQuestion.get(question.id);
      const isFreeText = question.type === "free_text";
      const isCorrect = isFreeText ? null : question.correctOptionIds.length > 0 && sameIds(answer?.selectedOptionIds ?? [], question.correctOptionIds);
      const earnedPoints = isFreeText
        ? answer?.reviewedPoints == null ? null : Math.max(0, Math.min(question.points, answer.reviewedPoints))
        : isCorrect ? question.points : 0;

      return {
        id: question.id,
        type: question.type,
        prompt: question.prompt,
        points: question.points,
        optionsSnapshot: question.optionsSnapshot,
        selectedOptionIds: answer?.selectedOptionIds ?? [],
        text: answer?.text ?? null,
        correctOptionIds: question.correctOptionIds,
        earnedPoints,
        isCorrect
      };
    });
}
