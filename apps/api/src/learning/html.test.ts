import { describe, expect, it } from "vitest";
import { sanitizeLearningBodies, sanitizeLearningHtml } from "./html";

describe("learning HTML policy", () => {
  it("returns null for empty content", () => {
    expect(sanitizeLearningHtml(null)).toBeNull();
    expect(sanitizeLearningHtml("  ")).toBeNull();
    expect(sanitizeLearningHtml("<script>alert(1)</script>")).toBeNull();
  });

  it("preserves supported lesson formatting", () => {
    expect(sanitizeLearningHtml('<h3>Шаг</h3><p><strong>Текст</strong></p><ul><li>Один</li></ul>')).toBe(
      '<h3>Шаг</h3><p><strong>Текст</strong></p><ul><li>Один</li></ul>'
    );
  });

  it("removes executable markup and unsafe anchors", () => {
    expect(sanitizeLearningHtml('<p onclick="alert(1)">Текст<script>alert(2)</script></p>')).toBe("<p>Текст</p>");
    expect(sanitizeLearningHtml('<a href="javascript:alert(1)">Ссылка</a>')).toBe("Ссылка");
  });

  it("allows safe internal, web, and email links", () => {
    expect(sanitizeLearningHtml('<a href="/learning/start">Внутри</a> <a href="https://example.com/a">Сайт</a> <a href="mailto:a@example.com">Почта</a>')).toBe(
      '<a href="/learning/start">Внутри</a> <a href="https://example.com/a">Сайт</a> <a href="mailto:a@example.com">Почта</a>'
    );
  });

  it("sanitizes the lesson body and every additional material body", () => {
    const result = sanitizeLearningBodies({
      body: '<p onclick="alert(1)">Урок</p>',
      materials: [
        { id: "one", body: '<strong>Заметка</strong><script>alert(2)</script>' },
        { id: "two", body: "" }
      ]
    });

    expect(result).toEqual({
      body: "<p>Урок</p>",
      materials: [
        { id: "one", body: "<strong>Заметка</strong>" },
        { id: "two", body: null }
      ]
    });
  });
});
