import { describe, expect, it } from "vitest";
import { htmlToMailingText, resolveMailingText, sanitizeMailingHtml } from "./html";

describe("mailing HTML", () => {
  it("keeps useful pasted formatting and removes unsafe markup", () => {
    const html = sanitizeMailingHtml(
      '<h2>Отчёт</h2><p style="color:red" onclick="alert(1)"><b>Важно</b> <i>сейчас</i> <code>54</code> <script>alert(1)</script><a href="javascript:alert(1)">ссылка</a></p><blockquote>Итог</blockquote><ul><li>Пункт</li></ul>'
    );

    expect(html).toContain("<h2>Отчёт</h2>");
    expect(html).toContain("<b>Важно</b>");
    expect(html).toContain("<i>сейчас</i>");
    expect(html).toContain("<code>54</code>");
    expect(html).toContain("<blockquote>Итог</blockquote>");
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

  it("turns an HTML subscription report into tag-free push text", () => {
    const text = htmlToMailingText("🚀 <b>ОТЧЕТ ПО ПОДПИСКАМ</b><br>💰 <b>Всего:</b> <code>54</code><br>✅ <i>Данные обновлены успешно</i>");

    expect(text).toBe("🚀 ОТЧЕТ ПО ПОДПИСКАМ\n💰 Всего: 54\n✅ Данные обновлены успешно");
    expect(text).not.toMatch(/<[^>]+>/);
  });

  it("preserves pasted line breaks in sanitized HTML and its text fallback", () => {
    const source =
      "🚀 <b>ОТЧЕТ ПО ПОДПИСКАМ</b>\n━━━━━━━━━━━━━━━━━━\n💰 <b>Всего:</b> <code>54</code>\n\n✅ <i>Данные обновлены успешно</i>";
    const html = sanitizeMailingHtml(source);

    expect(html).toBe(
      "🚀 <b>ОТЧЕТ ПО ПОДПИСКАМ</b><br>━━━━━━━━━━━━━━━━━━<br>💰 <b>Всего:</b> <code>54</code><br><br>✅ <i>Данные обновлены успешно</i>"
    );
    expect(htmlToMailingText(html)).toBe(
      "🚀 ОТЧЕТ ПО ПОДПИСКАМ\n━━━━━━━━━━━━━━━━━━\n💰 Всего: 54\n\n✅ Данные обновлены успешно"
    );
  });

  it("derives native push text from HTML instead of trusting submitted body text", () => {
    expect(resolveMailingText("<b>сырой тег</b>", "<b>Безопасный текст</b> <code>54</code>")).toBe("Безопасный текст 54");
    expect(resolveMailingText("  Обычный текст  ", "")).toBe("Обычный текст");
  });
});
