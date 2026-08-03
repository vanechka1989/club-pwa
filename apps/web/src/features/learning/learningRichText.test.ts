import { describe, expect, it } from "vitest";
import { prepareLearningHtml } from "./learningRichText";

describe("learning rich text policy", () => {
  it("preserves legacy plain-text line breaks", () => {
    expect(prepareLearningHtml("Первая строка\nВторая строка")).toBe("Первая строка<br>Вторая строка");
  });

  it("keeps supported formatting and safe links", () => {
    expect(prepareLearningHtml('<h2>Тема</h2><p><strong>Важно</strong> <a href="/learning/start">открыть</a></p>')).toBe(
      '<h2>Тема</h2><p><strong>Важно</strong> <a href="/learning/start">открыть</a></p>'
    );
  });

  it("removes executable markup while keeping readable text", () => {
    expect(prepareLearningHtml('<p onclick="alert(1)">Текст<script>alert(2)</script></p>')).toBe("<p>Текст</p>");
    expect(prepareLearningHtml('<a href="javascript:alert(1)">Ссылка</a>')).toBe("Ссылка");
  });
});
