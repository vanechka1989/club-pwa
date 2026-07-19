const allowedHtmlTags = new Set([
  "A",
  "B",
  "BLOCKQUOTE",
  "BR",
  "CODE",
  "EM",
  "H2",
  "H3",
  "I",
  "LI",
  "OL",
  "P",
  "STRONG",
  "U",
  "UL"
]);

export function escapeHtmlText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isSafeHref(value: string) {
  try {
    const url = new URL(value, window.location.origin);
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:";
  } catch {
    return false;
  }
}

function sanitizeNode(node: Node): Node | null {
  if (node.nodeType === Node.TEXT_NODE) {
    return document.createTextNode(node.textContent ?? "");
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }

  const element = node as HTMLElement;
  const tagName = element.tagName.toUpperCase();
  if (tagName === "SCRIPT" || tagName === "STYLE") {
    return null;
  }

  const safeLinkHref = tagName === "A" ? element.getAttribute("href")?.trim() : null;
  const shouldKeepElement = allowedHtmlTags.has(tagName) && (tagName !== "A" || Boolean(safeLinkHref && isSafeHref(safeLinkHref)));
  const nextElement = shouldKeepElement ? document.createElement(tagName.toLowerCase()) : document.createDocumentFragment();

  if (nextElement instanceof HTMLElement && tagName === "A") {
    if (safeLinkHref) {
      nextElement.setAttribute("href", safeLinkHref);
      nextElement.setAttribute("target", "_blank");
      nextElement.setAttribute("rel", "noopener noreferrer");
    }
  }

  for (const child of Array.from(element.childNodes)) {
    const nextChild = sanitizeNode(child);
    if (nextChild) {
      nextElement.appendChild(nextChild);
    }
  }

  return nextElement;
}

export function sanitizeHtml(value: string) {
  if (typeof DOMParser === "undefined" || typeof document === "undefined") {
    return escapeHtmlText(value).replace(/\n/g, "<br>");
  }

  const parsed = new DOMParser().parseFromString(value, "text/html");
  const container = document.createElement("div");
  for (const child of Array.from(parsed.body.childNodes)) {
    const nextChild = sanitizeNode(child);
    if (nextChild) {
      container.appendChild(nextChild);
    }
  }

  return container.innerHTML;
}
