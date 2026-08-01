import { fireEvent, render, screen, waitFor } from "@testing-library/vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LessonAssessmentPlayer from "./LessonAssessmentPlayer.vue";

const api = vi.hoisted(() => ({
  getLessonAssessmentStatus: vi.fn(),
  startLessonQuiz: vi.fn(),
  saveLessonQuizDraft: vi.fn(),
  submitLessonQuiz: vi.fn(),
  createHomeworkUpload: vi.fn(),
  submitLessonHomework: vi.fn()
}));
vi.mock("@/api/client", () => api);

describe("LessonAssessmentPlayer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getLessonAssessmentStatus.mockResolvedValue({ mode: "quiz", attempts: [], submissions: [] });
    api.startLessonQuiz.mockResolvedValue({ attempt: { id: "attempt-1", attemptNumber: 1, maxAttempts: 3, status: "in_progress", questions: [{ id: "question-1", type: "single_choice", prompt: "2 + 2?", points: 1, optionsSnapshot: [{ id: "four", text: "4" }, { id: "five", text: "5" }] }], answers: [{ questionId: "question-1", selectedOptionIds: ["four"], text: null }] } });
    api.saveLessonQuizDraft.mockResolvedValue({ ok: true });
  });

  it("starts a quiz and renders learner-safe answer options", async () => {
    render(LessonAssessmentPlayer, { props: { lessonId: "lesson-1", assessment: { mode: "quiz", title: "Тест", instructions: null, passingPercent: 70, maxAttempts: 3, questions: [] } } });
    await waitFor(() => expect(api.getLessonAssessmentStatus).toHaveBeenCalled());
    await fireEvent.click(screen.getByRole("button", { name: "Начать тест" }));
    expect(await screen.findByText("2 + 2?")).toBeTruthy();
    expect(screen.getByLabelText("4")).toBeTruthy();
    expect((screen.getByLabelText("4") as HTMLInputElement).checked).toBe(true);
  });

  it("explains each submitted quiz answer without duplicating the passing condition", async () => {
    api.getLessonAssessmentStatus.mockResolvedValue({
      mode: "quiz",
      attempts: [{
        id: "attempt-1", attemptNumber: 2, status: "failed", earnedPoints: 2, maxPoints: 4, percent: 50,
        submittedAt: "2026-08-01T12:30:00.000Z", reviewComment: null,
        questions: [
          { id: "question-1", type: "single_choice", prompt: "Сколько будет 2 + 2?", points: 2, optionsSnapshot: [{ id: "three", text: "3" }, { id: "four", text: "4" }], selectedOptionIds: ["four"], correctOptionIds: ["four"], text: null, earnedPoints: 2, isCorrect: true },
          { id: "question-2", type: "single_choice", prompt: "Столица Франции?", points: 2, optionsSnapshot: [{ id: "rome", text: "Рим" }, { id: "paris", text: "Париж" }], selectedOptionIds: ["rome"], correctOptionIds: ["paris"], text: null, earnedPoints: 0, isCorrect: false }
        ]
      }],
      submissions: []
    });
    render(LessonAssessmentPlayer, { props: { lessonId: "lesson-1", assessment: { mode: "quiz", title: "Итоговый тест", instructions: null, passingPercent: 70, maxAttempts: 3, questions: [] } } });

    expect(await screen.findByText("2 из 4 баллов")).toBeTruthy();
    expect(screen.getByText("Попытка 2 из 3")).toBeTruthy();
    expect(screen.queryByText("Проходной результат 70%")).toBeNull();
    expect(screen.getByLabelText("Ваш ответ: 4")).toBeTruthy();
    expect(screen.getByLabelText("Правильный ответ: 4")).toBeTruthy();
    expect(screen.getByLabelText("Ваш ответ: Рим")).toBeTruthy();
    expect(screen.getByLabelText("Правильный ответ: Париж")).toBeTruthy();
    expect(screen.getByText("Верно · 2 из 2 баллов")).toBeTruthy();
    expect(screen.getByText("Ошибка · 0 из 2 баллов")).toBeTruthy();
  });

  it("shows homework version and review timeline", async () => {
    api.getLessonAssessmentStatus.mockResolvedValue({
      mode: "homework",
      attempts: [],
      submissions: [{ id: "submission-1", version: 2, status: "needs_revision", submittedAt: "2026-08-01T12:30:00.000Z", reviewedAt: "2026-08-01T13:00:00.000Z", reviewComment: "Добавьте пример" }]
    });
    render(LessonAssessmentPlayer, { props: { lessonId: "lesson-1", assessment: { mode: "homework", title: "Практика", instructions: "", dueAt: null, allowText: true, allowAttachments: false, allowedFileKinds: [], maxAttachments: 0 } } });

    expect(await screen.findByText("Версия 2")).toBeTruthy();
    expect(screen.getByText("Отправлено")).toBeTruthy();
    expect(screen.getByText("Проверено")).toBeTruthy();
    expect(screen.getByText("Добавьте пример")).toBeTruthy();
  });
});
