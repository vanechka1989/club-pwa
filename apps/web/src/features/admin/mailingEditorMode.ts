import { sanitizeHtml } from "@/utils/sanitizeHtml";

export type MailingEditorMode = "visual" | "html";

const paragraphTags = new Set(["BLOCKQUOTE", "H2", "H3", "P"]);

function nodeToPlainText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }

  const element = node as HTMLElement;
  if (element.tagName === "BR") {
    return "\n";
  }

  const content = Array.from(element.childNodes).map(nodeToPlainText).join("");
  if (element.tagName === "LI") {
    return `• ${content.trim()}\n`;
  }

  return paragraphTags.has(element.tagName) ? `${content}\n\n` : content;
}

export function prepareMailingHtml(value: string) {
  const safeHtml = sanitizeHtml(value).trim().replace(/\r\n?/g, "\n").replace(/\n/g, "<br>");
  if (!safeHtml || typeof DOMParser === "undefined") {
    return { safeHtml, plainText: "" };
  }

  const parsed = new DOMParser().parseFromString(safeHtml, "text/html");
  const plainText = Array.from(parsed.body.childNodes)
    .map(nodeToPlainText)
    .join("")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { safeHtml, plainText };
}
