import sanitizeHtml from "sanitize-html";

const allowedTags = ["p", "br", "h2", "h3", "strong", "b", "em", "i", "u", "blockquote", "code", "ul", "ol", "li", "a"];

function isSafeLearningHref(value: string) {
  if (/^\/(?!\/)[A-Za-z0-9/_-]*(?:[?#][A-Za-z0-9%=&_+.-]*)?$/.test(value)) {
    return true;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "mailto:";
  } catch {
    return false;
  }
}

export function sanitizeLearningHtml(value: string | null | undefined) {
  const safe = sanitizeHtml(value ?? "", {
    allowedTags,
    allowedAttributes: { a: ["href"] },
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
    transformTags: {
      a: (_tagName, attribs) => {
        const href = attribs.href?.trim() ?? "";
        return isSafeLearningHref(href) ? { tagName: "a", attribs: { href } } : { tagName: "span", attribs: {} };
      }
    }
  }).trim();

  return safe || null;
}

export function sanitizeLearningBodies<
  TBody extends { body?: string | null },
  TMaterial extends { body?: string | null }
>(value: TBody & { materials?: TMaterial[] }) {
  return {
    ...value,
    body: sanitizeLearningHtml(value.body),
    ...(value.materials
      ? { materials: value.materials.map((material) => ({ ...material, body: sanitizeLearningHtml(material.body) })) }
      : {})
  };
}
