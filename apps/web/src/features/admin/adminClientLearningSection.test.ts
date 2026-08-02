import { cleanup, fireEvent, render, screen, within } from "@testing-library/vue";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import AdminClientLearningSection from "./AdminClientLearningSection.vue";

const source = readFileSync(resolve("src/features/admin/AdminClientLearningSection.vue"), "utf8");

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
  it("uses the compact flat layout of client detail pages", () => {
    expect(source).toContain('class="admin-client-learning admin-client-detail-surface"');
    expect(source).not.toContain('admin-client-section admin-detail ui-card');
    expect(source).toMatch(/\.admin-client-learning__summary\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
    expect(source).toMatch(/\.admin-client-learning__event\s*\{[^}]*min-height:\s*56px/s);
    expect(source).toMatch(/\.admin-client-learning__icon\s*\{[^}]*width:\s*32px;[^}]*height:\s*32px/s);
    expect(source).toMatch(/\.admin-client-learning__icon svg\s*\{[^}]*width:\s*16px/s);
  });

  it("keeps the pending review indicator in the compact summary grid", () => {
    expect(source).toContain(':class="{ \'has-pending\': pendingReviews }"');
    expect(source).toMatch(/\.admin-client-learning__summary\.has-pending\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/s);
    expect(source).toMatch(/@media \(max-width:\s*359px\)[\s\S]*\.admin-client-learning__summary\.has-pending\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  });

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

    expect(screen.getByRole("region", { name: "Обучение" })).toBeTruthy();
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
