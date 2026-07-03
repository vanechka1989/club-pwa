import { describe, expect, it } from "vitest";
import { escapeHtmlText, sanitizeHtml } from "./sanitizeHtml";

describe("sanitizeHtml", () => {
  it("keeps safe formatting and removes scripts/events from stored HTML", () => {
    expect(
      sanitizeHtml('<p onclick="alert(1)">Привет <strong>клуб</strong><script>alert(1)</script><img src=x onerror=alert(1)></p>')
    ).toBe("<p>Привет <strong>клуб</strong></p>");
  });

  it("keeps only http and https links and adds safe link attributes", () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">плохая</a> <a href="https://example.com">хорошая</a>')).toBe(
      'плохая <a href="https://example.com" target="_blank" rel="noreferrer">хорошая</a>'
    );
  });

  it("escapes plain fallback text", () => {
    expect(escapeHtmlText("<b>нет</b>")).toBe("&lt;b&gt;нет&lt;/b&gt;");
  });
});
