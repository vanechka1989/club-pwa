import { cleanup, fireEvent, render, screen } from "@testing-library/vue";
import { createPinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { useSessionStore } from "@/stores/session";
import LearningSection from "./LearningSection.vue";

function renderAsOwner() {
  const pinia = createPinia();
  const session = useSessionStore(pinia);
  session.user = {
    id: "owner-id",
    telegramId: "593677751",
    firstName: "Ivan",
    username: null,
    photoUrl: null,
    role: "owner",
    realRole: "owner",
    membershipStatus: "active",
    membershipExpiresAt: null,
    paymentType: "none",
    recurrentPaymentStatus: null,
    nextPaymentAt: null,
    avatarRefreshedAt: null
  };

  render(LearningSection, {
    global: {
      plugins: [pinia]
    }
  });
}

describe("Learning section modules", () => {
  beforeEach(() => {
    cleanup();
  });

  it("shows module cards in the mockups style", () => {
    render(LearningSection, {
      global: {
        plugins: [createPinia()]
      }
    });

    expect(screen.getByRole("heading", { name: "Модули" })).toBeTruthy();
    expect(screen.getByText("Модуль 1")).toBeTruthy();
    expect(screen.getByText("Модуль 2")).toBeTruthy();
    expect(screen.getByText("4 урока")).toBeTruthy();
    expect(screen.getByText("3 урока")).toBeTruthy();
    expect(screen.queryByText("Раздел в разработке")).toBeNull();
    expect(screen.queryByText("Обучение: варианты визуала")).toBeNull();
    expect(screen.queryByText("Статистика клуба")).toBeNull();
    expect(screen.queryByText("Контент")).toBeNull();
    expect(screen.queryByText("Последний открытый урок")).toBeNull();
    expect(screen.queryByRole("button", { name: "Добавить контент" })).toBeNull();
  });

  it("adds a module by title", async () => {
    renderAsOwner();

    await fireEvent.click(screen.getByRole("button", { name: "Добавить модуль" }));

    expect(screen.getByRole("dialog", { name: "Новый модуль" }).classList.contains("module-name-modal")).toBe(true);
    expect(screen.getByRole("dialog", { name: "Новый модуль" }).classList.contains("admin-client-modal")).toBe(false);
    expect(screen.getByLabelText("Название модуля").classList.contains("text-input")).toBe(true);

    await fireEvent.update(screen.getByLabelText("Название модуля"), "Модуль 3");
    await fireEvent.click(screen.getByRole("button", { name: "Сохранить модуль" }));

    expect(screen.getByText("Модуль 3")).toBeTruthy();
    expect(screen.getByText("0 уроков")).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Новый модуль" })).toBeNull();
  });

  it("renames a selected module", async () => {
    renderAsOwner();

    await fireEvent.click(screen.getByRole("button", { name: "Редактировать модуль" }));

    expect(screen.getByText("Выберите модуль для редактирования.")).toBeTruthy();

    await fireEvent.click(screen.getByRole("button", { name: "Редактировать Модуль 1" }));
    await fireEvent.update(screen.getByLabelText("Название модуля"), "Первый модуль");
    await fireEvent.click(screen.getByRole("button", { name: "Сохранить модуль" }));

    expect(screen.getByText("Первый модуль")).toBeTruthy();
    expect(screen.queryByText("Модуль 1")).toBeNull();
    expect(screen.queryByRole("dialog", { name: "Редактировать модуль" })).toBeNull();
  });
});
