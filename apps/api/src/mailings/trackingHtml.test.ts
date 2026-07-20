import { describe, expect, it } from "vitest";
import { instrumentMailingEmailHtml } from "./trackingHtml";
import { verifyMailingTrackingToken } from "./trackingToken";

describe("mailing email tracking HTML", () => {
  const recipientId = "9cf746ce-65af-4aa0-b0c1-3d18adb63e31";
  const secret = "tracking-html-secret";
  const origin = "https://club.example";

  it("rewrites safe web links and adds one open pixel", () => {
    const result = instrumentMailingEmailHtml({
      html: '<p><a href="https://example.com/report?a=1">Отчёт</a> <a href="mailto:help@example.com">Почта</a></p>',
      recipientId,
      origin,
      secret,
    });
    const clickToken = new URL(result.html.match(/href="([^"]*track\/click[^"]*)"/)?.[1] ?? "", origin).searchParams.get("token") ?? "";

    expect(verifyMailingTrackingToken(clickToken.replace(/&amp;/g, "&"), secret)).toEqual({
      purpose: "click",
      recipientId,
      destination: "https://example.com/report?a=1",
    });
    expect(result.html).toContain('href="mailto:help@example.com"');
    expect(result.html.match(/track\/open/g)).toHaveLength(1);
  });

  it("does not rewrite unsubscribe links and tracks an attachment", () => {
    const result = instrumentMailingEmailHtml({
      html: '<a href="https://club.example/api/mailings/unsubscribe?token=abc">Отписаться</a>',
      recipientId,
      origin,
      secret,
      attachmentUrl: "https://cdn.example.com/file.pdf",
    });
    expect(result.html).toContain("/api/mailings/unsubscribe?token=abc");
    expect(result.trackedAttachmentUrl).toContain("/api/mailings/track/click?token=");
  });
});
