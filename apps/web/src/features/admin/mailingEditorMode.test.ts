import { describe, expect, it } from "vitest";
import { prepareMailingHtml } from "./mailingEditorMode";

describe("mailing HTML editor mode", () => {
  it("prepares safe formatted HTML and readable push text", () => {
    const result = prepareMailingHtml(
      "🚀 <b>ОТЧЕТ ПО ПОДПИСКАМ</b><br>💰 <b>Всего:</b> <code>54</code><br>✅ <i>Данные обновлены успешно</i>"
    );

    expect(result.safeHtml).toBe(
      "🚀 <b>ОТЧЕТ ПО ПОДПИСКАМ</b><br>💰 <b>Всего:</b> <code>54</code><br>✅ <i>Данные обновлены успешно</i>"
    );
    expect(result.plainText).toBe("🚀 ОТЧЕТ ПО ПОДПИСКАМ\n💰 Всего: 54\n✅ Данные обновлены успешно");
  });

  it("removes unsafe markup before building preview and text", () => {
    const result = prepareMailingHtml('<p onclick="alert(1)">Текст<script>alert(1)</script></p>');

    expect(result).toEqual({ safeHtml: "<p>Текст</p>", plainText: "Текст" });
  });

  it("returns an empty message when sanitization removes all content", () => {
    expect(prepareMailingHtml("<script>alert(1)</script>")).toEqual({ safeHtml: "", plainText: "" });
  });

  it("keeps list items readable in native push text", () => {
    expect(prepareMailingHtml("<p>Итог</p><ul><li>Один</li><li>Два</li></ul>").plainText).toBe("Итог\n\n• Один\n• Два");
  });
});
