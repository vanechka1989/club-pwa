import { describe, expect, it } from "vitest";
import { htmlToMailingText, sanitizeMailingHtml } from "./html";

describe("mailing HTML", () => {
  it("keeps useful pasted formatting and removes unsafe markup", () => {
    const html = sanitizeMailingHtml(
      '<p style="color:red" onclick="alert(1)"><strong>Важно</strong> <script>alert(1)</script><a href="javascript:alert(1)">ссылка</a></p><ul><li>Пункт</li></ul>'
    );

    expect(html).toContain("<strong>Важно</strong>");
    expect(html).toContain("<ul><li>Пункт</li></ul>");
    expect(html).not.toContain("script");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("style=");
    expect(html).not.toContain("onclick");
  });

  it("creates a readable plain-text fallback", () => {
    expect(htmlToMailingText("<p>Первая <strong>строка</strong></p><ul><li>Один</li><li>Два</li></ul>")).toBe(
      "Первая строка\n\n• Один\n• Два"
    );
  });
});
