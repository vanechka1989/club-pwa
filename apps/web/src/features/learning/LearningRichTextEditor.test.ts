import { cleanup, fireEvent, render, screen } from "@testing-library/vue";
import { createPinia } from "pinia";
import { afterEach, describe, expect, it } from "vitest";
import LearningRichTextEditor from "./LearningRichTextEditor.vue";

afterEach(cleanup);

function renderEditor(modelValue = "Первая строка\nВторая строка") {
  return render(LearningRichTextEditor, {
    props: { modelValue, label: "Содержимое урока", placeholder: "Введите текст" },
    global: { plugins: [createPinia()] }
  });
}

describe("LearningRichTextEditor", () => {
  it("opens legacy text in the visual editor without losing line breaks", () => {
    renderEditor();
    expect(screen.getByRole("textbox", { name: "Содержимое урока" }).innerHTML).toBe("Первая строка<br>Вторая строка");
  });

  it("emits sanitized visual content", async () => {
    const view = renderEditor("");
    const editor = screen.getByRole("textbox", { name: "Содержимое урока" });
    editor.innerHTML = '<p onclick="alert(1)"><strong>Важно</strong><script>alert(2)</script></p>';
    await fireEvent.input(editor);
    expect(view.emitted()["update:modelValue"]?.at(-1)).toEqual(["<p><strong>Важно</strong></p>"]);
  });

  it("makes HTML source editing available from the compact menu", async () => {
    const view = renderEditor("<p>Текст</p>");
    await screen.getByRole("button", { name: "Дополнительные инструменты" }).click();
    await screen.getByRole("button", { name: "Редактировать HTML" }).click();
    const source = screen.getByRole("textbox", { name: "HTML-код: Содержимое урока" });
    await fireEvent.update(source, "<h2>Новый заголовок</h2>");
    expect(view.emitted()["update:modelValue"]?.at(-1)).toEqual(["<h2>Новый заголовок</h2>"]);
    expect(screen.getByRole("button", { name: "Вернуться к визуальному редактору" })).toBeTruthy();
  });

  it("sanitizes pasted HTML before inserting it", async () => {
    const view = renderEditor("");
    const editor = screen.getByRole("textbox", { name: "Содержимое урока" });
    await fireEvent.paste(editor, {
      clipboardData: {
        getData: (type: string) => type === "text/html" ? '<b>Текст</b><img src=x onerror="alert(1)">' : "Текст"
      }
    });
    expect(view.emitted()["update:modelValue"]?.at(-1)).toEqual(["<b>Текст</b>"]);
  });

  it("exposes touch-friendly formatting controls with accessible names", () => {
    renderEditor("");
    expect(screen.getByRole("button", { name: "Полужирный" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Курсив" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Маркированный список" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Добавить ссылку" })).toBeTruthy();
  });
});
