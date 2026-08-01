import { buildQuizAttemptReview } from "../learning/assessmentStatusResult";

type DateValue = Date | null;

type QuizQuestion = {
  id: string;
  type: string;
  prompt: string;
  points: number;
  optionsSnapshot: Array<{ id: string; text: string }>;
  correctOptionIds: string[];
  sortOrder: number;
};

type QuizAnswer = {
  questionSnapshotId: string;
  selectedOptionIds: string[];
  text: string | null;
  reviewedPoints: number | null;
};

function iso(value: DateValue) {
  return value?.toISOString() ?? null;
}

export function recordBelongsToUser(record: { userId: string }, expectedUserId: string) {
  return record.userId === expectedUserId;
}

export function resetBelongsToAttempt(
  reset: { createdAt: Date },
  attempt: { startedAt: Date },
  nextAttempt?: { startedAt: Date } | null
) {
  return reset.createdAt > attempt.startedAt && (!nextAttempt || reset.createdAt < nextAttempt.startedAt);
}

export function buildAdminQuizResult(input: {
  attempt: { id: string; userId: string; contentItemId: string; attemptNumber: number; status: string; earnedPoints: number | null; maxPoints: number | null; percent: number | null; startedAt: Date; submittedAt: DateValue; reviewedAt: DateValue };
  lesson: { title: string; categoryTitle: string; passingPercent: number | null };
  questions: QuizQuestion[];
  answers: QuizAnswer[];
  review: { comment: string | null } | null;
  reset: { reason: string | null; createdAt: Date } | null;
}) {
  return {
    mode: "quiz" as const,
    id: input.attempt.id,
    contentItemId: input.attempt.contentItemId,
    title: input.lesson.title,
    categoryTitle: input.lesson.categoryTitle,
    status: input.attempt.status,
    attemptNumber: input.attempt.attemptNumber,
    earnedPoints: input.attempt.earnedPoints,
    maxPoints: input.attempt.maxPoints,
    percent: input.attempt.percent,
    passingPercent: input.lesson.passingPercent,
    startedAt: input.attempt.startedAt.toISOString(),
    submittedAt: iso(input.attempt.submittedAt),
    reviewedAt: iso(input.attempt.reviewedAt),
    reviewComment: input.review?.comment ?? null,
    resetAt: input.reset?.createdAt.toISOString() ?? null,
    resetReason: input.reset?.reason ?? null,
    questions: buildQuizAttemptReview(input.attempt.status, input.questions, input.answers) ?? []
  };
}

export function buildAdminHomeworkResult(input: {
  submission: { id: string; userId: string; contentItemId: string; version: number; status: string; text: string | null; submittedAt: DateValue; reviewedAt: DateValue; acceptedAt: DateValue; resetAt: DateValue; resetReason: string | null };
  lesson: { title: string; categoryTitle: string; prompt: string | null };
  attachments: Array<{ id: string; fileName: string; contentType: string; sizeBytes: number; url: string }>;
  review: { decision: string; comment: string | null; createdAt: Date } | null;
}) {
  return {
    mode: "homework" as const,
    id: input.submission.id,
    contentItemId: input.submission.contentItemId,
    title: input.lesson.title,
    categoryTitle: input.lesson.categoryTitle,
    prompt: input.lesson.prompt,
    status: input.submission.status,
    version: input.submission.version,
    text: input.submission.text,
    submittedAt: iso(input.submission.submittedAt),
    reviewedAt: iso(input.submission.reviewedAt),
    acceptedAt: iso(input.submission.acceptedAt),
    reviewDecision: input.review?.decision ?? null,
    reviewComment: input.review?.comment ?? null,
    reviewCreatedAt: input.review?.createdAt.toISOString() ?? null,
    resetAt: iso(input.submission.resetAt),
    resetReason: input.submission.resetReason,
    attachments: input.attachments
  };
}
