import { cleanup, fireEvent, render, screen, within } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";
import AdminClientLearningSection from "./AdminClientLearningSection.vue";

afterEach(cleanup);

const engagement = [{
  contentItemId: "lesson-1",
  title: "Первый урок",
  categoryTitle: "Старт",
  opens: 3,
  totalActiveSeconds: 95,
  videoSeconds: 60,
  lastViewedAt: "2026-08-01T10:00:00.000Z"
}];

const assessments = [{
  mode: "quiz" as const,
  contentItemId: "lesson-1",
  recordId: "attempt-1",
  title: "Итоговый тест",
  categoryTitle: "Старт",
  status: "passed",
  percent: 80,
  earnedPoints: 4,
  maxPoints: 5,
  attemptNumber: 1,
  version: null,
  submittedAt: "2026-08-02T10:00:00.000Z",
  reviewedAt: null,
  reviewComment: null,
  resetAt: null,
  resetReason: null,
  canReset: false
}];

describe("admin client learning section", () => {
  it("combines lesson activity and assessments with compact filters", async () => {
    const { emitted } = render(AdminClientLearningSection, {
      props: {
        engagement,
        assessments,
        canManage: true,
        formatDuration: (seconds: number) => `${seconds} сек.`,
        formatDate: (value: string) => value.slice(0, 10)
      }
    });

    expect(screen.getAllByText("Обучение")).toHaveLength(1);
    expect(screen.getByText("1 урок")).toBeTruthy();
    expect(screen.getByText("1 результат")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Все" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Итоговый тест")).toBeTruthy();
    expect(screen.getByText("Первый урок")).toBeTruthy();

    await fireEvent.click(screen.getByRole("button", { name: "Уроки" }));
    expect(screen.queryByText("Итоговый тест")).toBeNull();
    expect(screen.getByText("Первый урок")).toBeTruthy();

    await fireEvent.click(screen.getByRole("button", { name: "Тесты и ДЗ" }));
    const result = screen.getByRole("button", { name: /Итоговый тест/ });
    expect(within(result).getByText("Тест пройден")).toBeTruthy();
    await fireEvent.click(result);
    expect(emitted()["open-result"]).toEqual([[{ mode: "quiz", recordId: "attempt-1" }]]);
  });

  it("does not open full results without the materials permission", async () => {
    const { emitted } = render(AdminClientLearningSection, {
      props: {
        engagement: [],
        assessments,
        canManage: false,
        formatDuration: (seconds: number) => `${seconds} сек.`,
        formatDate: (value: string) => value.slice(0, 10)
      }
    });

    const result = screen.getByRole("button", { name: /Итоговый тест/ });
    expect(result.hasAttribute("disabled")).toBe(true);
    await fireEvent.click(result);
    expect(emitted()["open-result"]).toBeUndefined();
  });
});
