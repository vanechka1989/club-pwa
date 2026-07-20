import sanitizeHtml from "sanitize-html";
import { createMailingTrackingToken } from "./trackingToken";

const allowedTags = ["p", "br", "strong", "b", "em", "i", "u", "code", "ul", "ol", "li", "a", "blockquote", "h2", "h3"];

function trackingUrl(origin: string, kind: "open" | "click", token: string) {
  return `${origin.replace(/\/$/, "")}/api/mailings/track/${kind}?token=${encodeURIComponent(token)}`;
}

function shouldTrackLink(href: string) {
  try {
    const url = new URL(href);
    return (url.protocol === "http:" || url.protocol === "https:") && !url.pathname.endsWith("/mailings/unsubscribe");
  } catch {
    return false;
  }
}

export function instrumentMailingEmailHtml(input: {
  html: string;
  recipientId: string;
  origin: string;
  attachmentUrl?: string | null;
  secret?: string;
}) {
  const trackedHtml = sanitizeHtml(input.html, {
    allowedTags,
    allowedAttributes: { a: ["href", "target", "rel"] },
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
    transformTags: {
      a: (_tagName, attribs) => {
        const href = attribs.href ?? "";
        if (!shouldTrackLink(href)) return { tagName: "a", attribs };
        const token = createMailingTrackingToken({ purpose: "click", recipientId: input.recipientId, destination: href }, input.secret);
        return {
          tagName: "a",
          attribs: { ...attribs, href: trackingUrl(input.origin, "click", token), target: "_blank", rel: "noopener noreferrer" }
        };
      }
    }
  });
  const openToken = createMailingTrackingToken({ purpose: "open", recipientId: input.recipientId }, input.secret);
  const pixel = `<img src="${trackingUrl(input.origin, "open", openToken)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0" />`;
  const trackedAttachmentUrl = input.attachmentUrl && shouldTrackLink(input.attachmentUrl)
    ? trackingUrl(
        input.origin,
        "click",
        createMailingTrackingToken({ purpose: "click", recipientId: input.recipientId, destination: input.attachmentUrl }, input.secret)
      )
    : input.attachmentUrl ?? null;

  return { html: `${trackedHtml}${pixel}`, trackedAttachmentUrl };
}
