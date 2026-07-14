import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { useAppDialogsStore } from "./appDialogs";

describe("global app dialogs", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("resolves a confirmation after the user accepts it", async () => {
    const dialogs = useAppDialogsStore();
    const result = dialogs.confirm({ title: "Удалить урок?", description: "Урок попадёт в архив.", tone: "danger" });

    expect(dialogs.active?.kind).toBe("confirm");
    dialogs.accept();

    await expect(result).resolves.toBe(true);
    expect(dialogs.active).toBeNull();
  });

  it("resolves confirmation and prompt cancellation with safe values", async () => {
    const dialogs = useAppDialogsStore();
    const confirmation = dialogs.confirm({ title: "Скрыть тариф?", description: "" });
    dialogs.cancel();
    await expect(confirmation).resolves.toBe(false);

    const prompt = dialogs.prompt({ title: "Добавить ссылку", label: "Ссылка" });
    dialogs.cancel();
    await expect(prompt).resolves.toBeNull();
  });

  it("submits a trimmed prompt value and validates it", async () => {
    const dialogs = useAppDialogsStore();
    const result = dialogs.prompt({
      title: "Добавить ссылку",
      label: "Ссылка",
      validate: (value) => (value.startsWith("https://") ? null : "Введите корректную ссылку")
    });

    expect(dialogs.submitPrompt("site.ru")).toBe("Введите корректную ссылку");
    expect(dialogs.active).not.toBeNull();
    expect(dialogs.submitPrompt("  https://site.ru  ")).toBeNull();
    await expect(result).resolves.toBe("https://site.ru");
  });

  it("safely cancels an unresolved dialog before opening the next one", async () => {
    const dialogs = useAppDialogsStore();
    const first = dialogs.confirm({ title: "Первый", description: "" });
    const second = dialogs.confirm({ title: "Второй", description: "" });

    await expect(first).resolves.toBe(false);
    expect(dialogs.active?.title).toBe("Второй");
    dialogs.cancel();
    await expect(second).resolves.toBe(false);
  });
});
