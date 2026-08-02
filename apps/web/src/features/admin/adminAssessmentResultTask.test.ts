import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getAdminAssessmentResult, type AdminAssessmentResult } from "@/api/client";
import AdminAssessmentResultTask from "./AdminAssessmentResultTask.vue";

vi.mock("@/api/client", () => ({ getAdminAssessmentResult: vi.fn() }));
vi.mock("@/features/app/TaskScreen.vue", () => ({ default: { template: '<section><h1>{{ title }}</h1><slot /></section>', props: ["title"] } }));
afterEach(cleanup);

const quizResult: AdminAssessmentResult = {
  mode: "quiz", id: "attempt-visibility", contentItemId: "lesson-1", title: "Проверка кнопки теста", categoryTitle: "Старт", status: "failed",
  attemptNumber: 1, earnedPoints: 1, maxPoints: 2, percent: 50, passingPercent: 70, startedAt: "2026-08-02T09:00:00.000Z", submittedAt: "2026-08-02T10:00:00.000Z", reviewedAt: null, reviewComment: null, resetAt: null, resetReason: null,
  questions: []
};

const homeworkResult: AdminAssessmentResult = {
  mode: "homework", id: "submission-visibility", contentItemId: "lesson-2", title: "Проверка кнопки ДЗ", categoryTitle: "Старт", prompt: "Опишите результат", status: "accepted", version: 1, text: "Ответ", submittedAt: "2026-08-01T10:00:00.000Z", reviewedAt: "2026-08-02T10:00:00.000Z", acceptedAt: "2026-08-02T10:00:00.000Z", reviewDecision: "accepted", reviewComment: null, reviewCreatedAt: "2026-08-02T10:00:00.000Z", resetAt: null, resetReason: null,
  attachments: []
};

async function renderResult(result: AdminAssessmentResult, canReset = true) {
  vi.mocked(getAdminAssessmentResult).mockResolvedValue({ result });
  render(AdminAssessmentResultTask, { props: { telegramId: "123", mode: result.mode, recordId: result.id, clientName: "Иван", canReset, formatDate: (value: string) => value.slice(0, 10) } });
  await screen.findByText(result.title);
}

describe("admin assessment result task", () => {
  it("shows every quiz option with the client and correct answers", async () => {
    vi.mocked(getAdminAssessmentResult).mockResolvedValue({ result: {
      mode: "quiz", id: "attempt-1", contentItemId: "lesson-1", title: "Итоговый тест", categoryTitle: "Старт", status: "failed",
      attemptNumber: 2, earnedPoints: 1, maxPoints: 2, percent: 50, passingPercent: 70, startedAt: "2026-08-02T09:00:00.000Z", submittedAt: "2026-08-02T10:00:00.000Z", reviewedAt: null, reviewComment: "Повторить тему", resetAt: null, resetReason: null,
      questions: [{ id: "q1", type: "single_choice", prompt: "Сколько будет 2+2?", points: 2, optionsSnapshot: [{ id: "a", text: "3" }, { id: "b", text: "4" }], selectedOptionIds: ["a"], text: null, correctOptionIds: ["b"], earnedPoints: 0, isCorrect: false }]
    } });
    render(AdminAssessmentResultTask, { props: { telegramId: "123", mode: "quiz", recordId: "attempt-1", clientName: "Иван", canReset: true, formatDate: (value: string) => value.slice(0, 10) } });

    expect(await screen.findByText("Итоговый тест")).toBeTruthy();
    expect(screen.getByText("Сколько будет 2+2?")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getByText("Ответ клиента")).toBeTruthy();
    expect(screen.getByText("Правильный ответ")).toBeTruthy();
    expect(screen.getByText("1 из 2 баллов")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Сбросить результат" })).toBeTruthy();
  });

  it("shows the complete homework response, review and attached file", async () => {
    vi.mocked(getAdminAssessmentResult).mockResolvedValue({ result: {
      mode: "homework", id: "submission-1", contentItemId: "lesson-2", title: "Практика", categoryTitle: "Старт", prompt: "Опишите результат", status: "accepted", version: 2, text: "Мой подробный ответ", submittedAt: "2026-08-01T10:00:00.000Z", reviewedAt: "2026-08-02T10:00:00.000Z", acceptedAt: "2026-08-02T10:00:00.000Z", reviewDecision: "accepted", reviewComment: "Отличная работа", reviewCreatedAt: "2026-08-02T10:00:00.000Z", resetAt: null, resetReason: null,
      attachments: [{ id: "file-1", fileName: "report.pdf", contentType: "application/pdf", sizeBytes: 2048, url: "https://example.com/report.pdf" }]
    } });
    render(AdminAssessmentResultTask, { props: { telegramId: "123", mode: "homework", recordId: "submission-1", clientName: "Иван", canReset: true, formatDate: (value: string) => value.slice(0, 10) } });

    expect(await screen.findByText("Практика")).toBeTruthy();
    expect(screen.getByText("Версия 2")).toBeTruthy();
    expect(screen.getByText("Принято")).toBeTruthy();
    expect(screen.getByText("Мой подробный ответ")).toBeTruthy();
    expect(screen.getByText("Отличная работа")).toBeTruthy();
    expect(screen.getByRole("link", { name: /report.pdf/ }).getAttribute("href")).toBe("https://example.com/report.pdf");
    expect(screen.getByRole("button", { name: "Сбросить результат" })).toBeTruthy();
  });

  it.each(["passed", "failed"])("shows reset for a %s quiz result", async (status) => {
    await renderResult({ ...quizResult, status });

    expect(screen.getByRole("button", { name: "Сбросить результат" })).toBeTruthy();
  });

  it("shows reset for an accepted homework result", async () => {
    await renderResult(homeworkResult);

    expect(screen.getByRole("button", { name: "Сбросить результат" })).toBeTruthy();
  });

  it.each([
    ["quiz pending review", { ...quizResult, status: "pending_review" }, true],
    ["homework pending review", { ...homeworkResult, status: "pending_review" }, true],
    ["homework needing revision", { ...homeworkResult, status: "needs_revision" }, true],
    ["homework draft", { ...homeworkResult, status: "draft" }, true],
    ["homework in progress", { ...homeworkResult, status: "in_progress" }, true],
    ["already reset quiz", { ...quizResult, resetAt: "2026-08-02T11:00:00.000Z" }, true],
    ["already reset homework", { ...homeworkResult, resetAt: "2026-08-02T11:00:00.000Z" }, true],
    ["quiz without reset permission", quizResult, false],
    ["homework without reset permission", homeworkResult, false]
  ] as Array<[string, AdminAssessmentResult, boolean]>)("hides reset for %s", async (_case, result, canReset) => {
    await renderResult(result, canReset);

    expect(screen.queryByRole("button", { name: "Сбросить результат" })).toBeNull();
  });
});
