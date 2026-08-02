import { cleanup, fireEvent, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getAssessmentReviewQueue, getHomeworkReview } from "@/api/client";
import AdminAssessmentReviewQueue from "./AdminAssessmentReviewQueue.vue";

vi.mock("@/api/client", () => ({
  getAssessmentReviewQueue: vi.fn(),
  getHomeworkReview: vi.fn(),
  getQuizReview: vi.fn(),
  resetQuizAttempts: vi.fn(),
  reviewHomework: vi.fn(),
  reviewQuiz: vi.fn()
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("admin assessment review queue", () => {
  it("renders the review dialog at the document layer so bottom navigation cannot cover its actions", async () => {
    vi.mocked(getAssessmentReviewQueue).mockResolvedValue({
      total: 1,
      homework: [{
        id: "submission-1",
        user: { displayName: "Иван", photoUrl: null },
        lesson: { id: "lesson-1", title: "Первый" },
        version: 1,
        text: "Ответ клиента",
        submittedAt: "2026-08-02T16:00:00.000Z"
      }],
      quizzes: []
    });
    vi.mocked(getHomeworkReview).mockResolvedValue({
      submission: { id: "submission-1", text: "Ответ клиента", version: 1 },
      attachments: [{
        id: "attachment-1",
        fileName: "result.jpg",
        contentType: "image/jpeg",
        sizeBytes: 860_160,
        url: "https://example.com/result.jpg"
      }]
    });

    render(AdminAssessmentReviewQueue);
    await fireEvent.click(await screen.findByRole("button", { name: /Первый/ }));

    const dialog = await screen.findByRole("dialog", { name: "Проверка: Первый" });
    expect(dialog.parentElement).toBe(document.body);
    expect(screen.getByRole("button", { name: "На доработку" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Принять" })).toBeTruthy();
  });
});
