import { cleanup, fireEvent, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";
import HomeworkReviewResultsTask from "./HomeworkReviewResultsTask.vue";

const notices = [{
  submissionId: "submission-revision",
  contentItemId: "lesson-1",
  lessonTitle: "Карточка 1",
  status: "needs_revision" as const,
  reviewComment: "Добавьте пример",
  reviewedAt: "2026-08-02T16:40:00.000Z"
}, {
  submissionId: "submission-accepted",
  contentItemId: "lesson-2",
  lessonTitle: "Карточка 2",
  status: "accepted" as const,
  reviewComment: "Отличная работа",
  reviewedAt: "2026-08-02T17:40:00.000Z"
}];

afterEach(cleanup);

describe("HomeworkReviewResultsTask", () => {
  it("shows every result with moderator comments and independent actions", async () => {
    const { emitted } = render(HomeworkReviewResultsTask, { props: { notices, dismissingIds: [] } });

    expect(screen.getByRole("heading", { name: "Результаты ДЗ" })).toBeTruthy();
    expect(screen.getByText("Домашнее задание не принято")).toBeTruthy();
    expect(screen.getByText("ДЗ принято")).toBeTruthy();
    expect(screen.getAllByText("Комментарий модератора")).toHaveLength(2);
    expect(screen.getByText("Добавьте пример")).toBeTruthy();
    expect(screen.getByText("Отличная работа")).toBeTruthy();

    await fireEvent.click(screen.getByRole("button", { name: "Закрыть результат ДЗ Карточка 1" }));
    expect(emitted().dismiss).toEqual([["submission-revision"]]);

    await fireEvent.click(screen.getByRole("button", { name: "Исправить ДЗ: Карточка 1" }));
    expect(emitted().openLesson).toEqual([["lesson-1"]]);
  });

  it("shows a calm empty state after all results are dismissed", () => {
    render(HomeworkReviewResultsTask, { props: { notices: [], dismissingIds: [] } });

    expect(screen.getByText("Новых результатов нет")).toBeTruthy();
    expect(screen.queryByText("Проверки ДЗ")).toBeNull();
  });
});
