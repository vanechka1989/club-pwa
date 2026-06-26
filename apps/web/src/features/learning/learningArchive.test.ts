import { cleanup, fireEvent, render, screen } from "@testing-library/vue";
import { createPinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

function renderAsMember() {
  const pinia = createPinia();
  const session = useSessionStore(pinia);
  session.user = {
    id: "member-id",
    telegramId: "753327296",
    firstName: "Екатерина",
    username: null,
    photoUrl: null,
    role: "member",
    realRole: "member",
    membershipStatus: "active",
    membershipExpiresAt: null,
    paymentType: "manual",
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

async function expandModuleOne() {
  await fireEvent.click(screen.getByRole("button", { name: "Развернуть Модуль 1" }));
}

describe("Learning section modules", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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
    expect(screen.queryByRole("button", { name: /Вариант 1\. Плеер и очередь/ })).toBeNull();
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

    expect(screen.queryByRole("button", { name: "Редактировать модуль" })).toBeNull();

    await fireEvent.click(screen.getByRole("button", { name: "Редактировать Модуль 1" }));
    await fireEvent.update(screen.getByLabelText("Название модуля"), "Первый модуль");
    await fireEvent.click(screen.getByRole("button", { name: "Сохранить модуль" }));

    expect(screen.getByText("Первый модуль")).toBeTruthy();
    expect(screen.queryByText("Модуль 1")).toBeNull();
    expect(screen.queryByRole("dialog", { name: "Редактировать модуль" })).toBeNull();
  });

  it("collapses and expands a module from its header", async () => {
    renderAsOwner();

    expect(screen.queryByRole("button", { name: /Вариант 1\. Плеер и очередь/ })).toBeNull();
    expect(screen.getAllByText("Модуль клуба").length).toBeGreaterThanOrEqual(1);

    await expandModuleOne();

    expect(screen.getByRole("button", { name: /Вариант 1\. Плеер и очередь/ })).toBeTruthy();

    await fireEvent.click(screen.getByRole("button", { name: "Свернуть Модуль 1" }));

    expect(screen.queryByRole("button", { name: /Вариант 1\. Плеер и очередь/ })).toBeNull();
  });

  it("opens a lesson modal from a module lesson card", async () => {
    renderAsOwner();

    await expandModuleOne();
    await fireEvent.click(screen.getByRole("button", { name: /Вариант 1\. Плеер и очередь/ }));

    const lessonDialog = screen.getByRole("dialog", { name: "Вариант 1. Плеер и очередь" });
    expect(lessonDialog).toBeTruthy();
    expect(lessonDialog.querySelector(".lesson-preview-scroll")).toBeTruthy();
    expect(screen.getByText("Урок из модуля")).toBeTruthy();
    expect(lessonDialog.textContent).toContain("Модуль 1");
  });

  it("renders horizontal lesson cards when a lesson uses horizontal layout", async () => {
    renderAsOwner();

    await expandModuleOne();

    const horizontalLesson = screen.getByRole("button", { name: /Вариант 2\. Модули и уроки/ });
    expect(horizontalLesson.classList.contains("admin-mockup-thumb-horizontal")).toBe(true);
    expect(horizontalLesson.classList.contains("admin-mockup-thumb-vertical")).toBe(false);
  });

  it("uses a compact lesson modal for member viewing", async () => {
    renderAsMember();

    await expandModuleOne();
    await fireEvent.click(screen.getByRole("button", { name: /Вариант 3\. Библиотека/ }));

    const lessonDialog = screen.getByRole("dialog", { name: "Вариант 3. Библиотека" });
    expect(lessonDialog.classList.contains("lesson-preview-modal-view")).toBe(true);
    expect(lessonDialog.classList.contains("lesson-preview-modal-edit")).toBe(false);
    expect(screen.queryByLabelText("Название урока")).toBeNull();
  });

  it("adds a lesson inside a selected module", async () => {
    renderAsOwner();

    await expandModuleOne();
    await fireEvent.click(screen.getByRole("button", { name: "Добавить урок в Модуль 1" }));

    const lessonDialog = screen.getByRole("dialog", { name: "Новый урок" });
    expect(lessonDialog).toBeTruthy();

    await fireEvent.update(screen.getByLabelText("Название урока"), "Новый урок");
    await fireEvent.update(screen.getByLabelText("Описание урока"), "Короткое описание нового урока");
    await fireEvent.click(screen.getByRole("button", { name: "Сохранить урок" }));

    expect(screen.queryByRole("dialog", { name: "Новый урок" })).toBeNull();
    expect(screen.getByRole("button", { name: /Новый урок/ })).toBeTruthy();
    expect(screen.getByText("5 уроков")).toBeTruthy();
  });

  it("saves the selected lesson card layout", async () => {
    renderAsOwner();

    await expandModuleOne();
    await fireEvent.click(screen.getByRole("button", { name: "Добавить урок в Модуль 1" }));

    await fireEvent.update(screen.getByLabelText("Название урока"), "Горизонтальный урок");
    await fireEvent.update(screen.getByLabelText("Описание урока"), "Компактная карточка урока");
    await fireEvent.click(screen.getByRole("button", { name: "Горизонтальная карточка" }));
    await fireEvent.click(screen.getByRole("button", { name: "Сохранить урок" }));

    const lessonCard = screen.getByRole("button", { name: /Горизонтальный урок/ });
    expect(lessonCard.classList.contains("admin-mockup-thumb-horizontal")).toBe(true);
  });

  it("edits lesson content from the same lesson modal", async () => {
    renderAsOwner();

    await expandModuleOne();
    await fireEvent.click(screen.getByRole("button", { name: /Вариант 1\. Плеер и очередь/ }));

    await fireEvent.update(screen.getByLabelText("Название урока"), "Первый урок");
    await fireEvent.update(screen.getByLabelText("Описание урока"), "Обновленное описание урока");
    await fireEvent.click(screen.getByRole("button", { name: "Сохранить урок" }));

    expect(screen.queryByRole("dialog", { name: "Вариант 1. Плеер и очередь" })).toBeNull();
    expect(screen.getByRole("button", { name: /Первый урок/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Вариант 1\. Плеер и очередь/ })).toBeNull();
  });

  it("deletes a lesson from a module after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderAsOwner();

    await expandModuleOne();
    await fireEvent.click(screen.getByRole("button", { name: /Вариант 1\. Плеер и очередь/ }));
    await fireEvent.click(screen.getByRole("button", { name: "Удалить урок" }));

    expect(window.confirm).toHaveBeenCalledWith('Удалить урок "Вариант 1. Плеер и очередь"? Он попадет в удалённые на 7 дней.');
    expect(screen.queryByRole("dialog", { name: "Вариант 1. Плеер и очередь" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Вариант 1\. Плеер и очередь/ })).toBeNull();
    expect(screen.getAllByText("3 урока").length).toBeGreaterThanOrEqual(1);
  });
});
