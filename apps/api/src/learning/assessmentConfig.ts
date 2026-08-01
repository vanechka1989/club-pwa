import type { LessonAssessmentConfig, LessonAssessmentDraft } from "@club/shared";

export function buildStoredAssessment(draft: Exclude<LessonAssessmentDraft, { mode: "none" }>) {
  const revision = {
    mode: draft.mode,
    title: draft.title,
    instructions: draft.instructions,
    passingPercent: draft.mode === "quiz" ? draft.passingPercent : null,
    maxAttempts: draft.mode === "quiz" ? draft.maxAttempts : null,
    dueAt: draft.mode === "homework" && draft.dueAt ? new Date(draft.dueAt) : null,
    allowText: draft.mode === "homework" ? draft.allowText : null,
    allowAttachments: draft.mode === "homework" ? draft.allowAttachments : null,
    allowedFileKinds: draft.mode === "homework" ? draft.allowedFileKinds : null,
    maxAttachments: draft.mode === "homework" ? draft.maxAttachments : null
  };

  const questions = draft.mode === "quiz"
    ? draft.questions.map((question, questionIndex) => ({
        stableKey: question.id,
        type: question.type,
        prompt: question.prompt,
        points: question.points,
        sortOrder: questionIndex,
        options: question.options.map((option, optionIndex) => ({
          stableKey: option.id,
          text: option.text,
          isCorrect: question.correctOptionIds.includes(option.id),
          sortOrder: optionIndex
        }))
      }))
    : [];

  return { revision, questions };
}

export function toPublicAssessment(draft: LessonAssessmentDraft): LessonAssessmentConfig {
  if (draft.mode !== "quiz") return draft;
  return {
    mode: "quiz",
    title: draft.title,
    instructions: draft.instructions,
    passingPercent: draft.passingPercent,
    maxAttempts: draft.maxAttempts,
    questions: draft.questions.map(({ correctOptionIds: _correctOptionIds, ...question }) => question)
  };
}
