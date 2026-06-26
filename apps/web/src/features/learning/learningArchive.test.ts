import { cleanup, render, screen } from "@testing-library/vue";
import { createPinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import LearningSection from "./LearningSection.vue";

describe("Learning section placeholder", () => {
  beforeEach(() => {
    cleanup();
  });

  it("shows only the development placeholder", () => {
    render(LearningSection, {
      global: {
        plugins: [createPinia()]
      }
    });

    expect(screen.getByRole("heading", { name: "Модули" })).toBeTruthy();
    expect(screen.getByText("Раздел в разработке")).toBeTruthy();
    expect(screen.queryByText("Контент")).toBeNull();
    expect(screen.queryByText("Последний открытый урок")).toBeNull();
    expect(screen.queryByRole("button", { name: "Добавить контент" })).toBeNull();
  });
});
