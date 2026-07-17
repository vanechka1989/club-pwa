import sanitizeHtml from "sanitize-html";

const allowedTags = ["p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li", "a", "blockquote", "h2", "h3"];

export function sanitizeMailingHtml(value: string) {
  return sanitizeHtml(value, {
    allowedTags,
    allowedAttributes: { a: ["href", "target", "rel"] },
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
    transformTags: {
      a: (_tagName, attribs) => ({
        tagName: "a",
        attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer" }
      })
    }
  }).trim();
}

export function htmlToMailingText(value: string) {
  const safe = sanitizeMailingHtml(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/(p|h2|h3|blockquote)>/gi, "\n\n")
    .replace(/<[^>]*>/g, "");
  return sanitizeHtml(safe, { allowedTags: [], allowedAttributes: {} })
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
