import { describe, expect, it } from "vitest";
import { escapeHtmlText, sanitizeHtml } from "./sanitizeHtml";

describe("sanitizeHtml", () => {
  it("keeps safe formatting and removes scripts/events from stored HTML", () => {
    expect(
      sanitizeHtml('<h2>Отчёт</h2><p onclick="alert(1)"><b>Привет</b> <i>клуб</i> <code>54</code><script>alert(1)</script><img src=x onerror=alert(1)></p><blockquote>Итог</blockquote>')
    ).toBe("<h2>Отчёт</h2><p><b>Привет</b> <i>клуб</i> <code>54</code></p><blockquote>Итог</blockquote>");
  });

  it("keeps only http and https links and adds safe link attributes", () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">плохая</a> <a href="https://example.com">сайт</a> <a href="mailto:test@example.com">почта</a>')).toBe(
      'плохая <a href="https://example.com" target="_blank" rel="noopener noreferrer">сайт</a> <a href="mailto:test@example.com" target="_blank" rel="noopener noreferrer">почта</a>'
    );
  });

  it("escapes plain fallback text", () => {
    expect(escapeHtmlText("<b>нет</b>")).toBe("&lt;b&gt;нет&lt;/b&gt;");
  });
});
