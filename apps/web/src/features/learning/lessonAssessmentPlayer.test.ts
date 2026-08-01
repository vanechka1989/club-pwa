import { fireEvent, render, screen, waitFor } from "@testing-library/vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LessonAssessmentPlayer from "./LessonAssessmentPlayer.vue";

const api = vi.hoisted(() => ({
  getLessonAssessmentStatus: vi.fn(),
  startLessonQuiz: vi.fn(),
  submitLessonQuiz: vi.fn(),
  createHomeworkUpload: vi.fn(),
  submitLessonHomework: vi.fn()
}));
vi.mock("@/api/client", () => api);

describe("LessonAssessmentPlayer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getLessonAssessmentStatus.mockResolvedValue({ mode: "quiz", attempts: [], submissions: [] });
    api.startLessonQuiz.mockResolvedValue({ attempt: { id: "attempt-1", attemptNumber: 1, maxAttempts: 3, status: "in_progress", questions: [{ id: "question-1", type: "single_choice", prompt: "2 + 2?", points: 1, optionsSnapshot: [{ id: "four", text: "4" }, { id: "five", text: "5" }] }] } });
  });

  it("starts a quiz and renders learner-safe answer options", async () => {
    render(LessonAssessmentPlayer, { props: { lessonId: "lesson-1", assessment: { mode: "quiz", title: "Тест", instructions: null, passingPercent: 70, maxAttempts: 3, questions: [] } } });
    await waitFor(() => expect(api.getLessonAssessmentStatus).toHaveBeenCalled());
    await fireEvent.click(screen.getByRole("button", { name: "Начать тест" }));
    expect(await screen.findByText("2 + 2?")).toBeTruthy();
    expect(screen.getByLabelText("4")).toBeTruthy();
  });
});
