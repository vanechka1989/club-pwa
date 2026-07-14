import { cleanup, fireEvent, render, screen } from "@testing-library/vue";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { useAppDialogsStore } from "@/stores/appDialogs";
import AppDialogHost from "./AppDialogHost.vue";

describe("AppDialogHost", () => {
  beforeEach(() => {
    cleanup();
    setActivePinia(createPinia());
  });

  function renderHost() {
    const pinia = createPinia();
    setActivePinia(pinia);
    render(AppDialogHost, { global: { plugins: [pinia] } });
    return useAppDialogsStore(pinia);
  }

  it("renders a themed danger confirmation and keeps safe cancellation first", async () => {
    const dialogs = renderHost();
    const result = dialogs.confirm({
      title: "Удалить урок?",
      description: "Он попадёт в удалённые на 7 дней.",
      confirmLabel: "Удалить урок",
      tone: "danger"
    });
    await nextTick();

    const dialog = screen.getByRole("alertdialog", { name: "Удалить урок?" });
    expect(dialog.classList.contains("app-dialog-danger")).toBe(true);
    expect(screen.getByRole("button", { name: "Отмена" })).toBe(document.activeElement);
    await fireEvent.click(screen.getByRole("button", { name: "Удалить урок" }));
    await expect(result).resolves.toBe(true);
  });

  it("cancels on Escape and backdrop click", async () => {
    const dialogs = renderHost();
    const escapeResult = dialogs.confirm({ title: "Первое окно", description: "" });
    await nextTick();
    await fireEvent.keyDown(document, { key: "Escape" });
    await expect(escapeResult).resolves.toBe(false);

    const backdropResult = dialogs.confirm({ title: "Второе окно", description: "" });
    await nextTick();
    await fireEvent.click(document.body.querySelector(".app-dialog-backdrop") as HTMLElement);
    await expect(backdropResult).resolves.toBe(false);
  });

  it("shows a labelled prompt and inline validation instead of a browser prompt", async () => {
    const dialogs = renderHost();
    const result = dialogs.prompt({
      title: "Добавить ссылку",
      label: "Ссылка",
      placeholder: "https://example.com",
      validate: (value) => (value.includes(".") ? null : "Введите корректную ссылку")
    });
    await nextTick();

    const input = screen.getByRole("textbox", { name: "Ссылка" });
    await fireEvent.update(input, "ошибка");
    await fireEvent.click(screen.getByRole("button", { name: "Добавить" }));
    expect(screen.getByText("Введите корректную ссылку")).toBeTruthy();

    await fireEvent.update(input, "example.com");
    await fireEvent.click(screen.getByRole("button", { name: "Добавить" }));
    await expect(result).resolves.toBe("example.com");
  });
});
