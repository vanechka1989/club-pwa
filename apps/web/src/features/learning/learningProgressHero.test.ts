import { cleanup, fireEvent, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";
import LearningProgressHero from "./LearningProgressHero.vue";
import LearningModuleProgress from "./LearningModuleProgress.vue";

afterEach(cleanup);

describe("unified learning progress", () => {
  it.each([
    [0, "Начните обучение", "Начать"],
    [33, "Продолжайте обучение", "Продолжить"],
    [100, "Обучение завершено", "Повторить последний урок"]
  ])("renders the %i%% state with one primary action", async (percent, state, action) => {
    const { emitted } = render(LearningProgressHero, { props: { percent, completed: percent === 100 ? 3 : percent ? 1 : 0, total: 3, state, title: "Тестовая 1", context: "Обзорный", imageUrl: "/cover.jpg", actionLabel: action } });
    expect(screen.getByRole("progressbar", { name: "Общий прогресс обучения" }).getAttribute("aria-valuenow")).toBe(String(percent));
    expect(screen.getByText(state)).toBeTruthy();
    const button = screen.getByRole("button", { name: new RegExp(action) });
    expect(screen.getAllByRole("button")).toHaveLength(1);
    await fireEvent.click(button);
    expect(emitted().open).toHaveLength(1);
  });

  it("renders one compact module progress status", () => {
    render(LearningModuleProgress, { props: { title: "Обзорный", completed: 1, total: 3, percent: 33 } });
    expect(screen.getByText("В процессе")).toBeTruthy();
    expect(screen.getByText("1 из 3 уроков")).toBeTruthy();
    expect(screen.getByText("33%")).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "Прогресс модуля Обзорный" }).getAttribute("aria-valuenow")).toBe("33");
  });
});
