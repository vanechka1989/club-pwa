export const moduleCategoryDescriptionPrefix = "__club_module__";
const moduleCategoryMetaPrefix = "__club_meta__";

export function encodeModuleCategoryDescription(description?: string | null, defaultCardLayout: "vertical" | "horizontal" = "vertical") {
  const cleanDescription = description?.trim() ?? "";
  const meta = `${moduleCategoryMetaPrefix}${JSON.stringify({ defaultCardLayout })}`;

  return cleanDescription ? `${moduleCategoryDescriptionPrefix}\n${meta}\n${cleanDescription}` : `${moduleCategoryDescriptionPrefix}\n${meta}`;
}

export function isModuleCategoryDescription(description: string | null) {
  return description?.startsWith(moduleCategoryDescriptionPrefix) ?? false;
}

export function decodeModuleCategoryDescription(description: string | null) {
  if (!isModuleCategoryDescription(description)) {
    return description;
  }

  const decoded =
    description
      ?.slice(moduleCategoryDescriptionPrefix.length)
      .replace(/^\n/, "")
      .split("\n")
      .filter((line) => !line.startsWith(moduleCategoryMetaPrefix))
      .join("\n")
      .trim() ?? "";

  return decoded || null;
}

export function decodeModuleCategoryDefaultCardLayout(description: string | null): "vertical" | "horizontal" {
  if (!isModuleCategoryDescription(description)) {
    return "vertical";
  }

  const metaLine = description
    ?.slice(moduleCategoryDescriptionPrefix.length)
    .replace(/^\n/, "")
    .split("\n")
    .find((line) => line.startsWith(moduleCategoryMetaPrefix));
  if (!metaLine) {
    return "vertical";
  }

  try {
    const meta = JSON.parse(metaLine.slice(moduleCategoryMetaPrefix.length)) as { defaultCardLayout?: string };
    return meta.defaultCardLayout === "horizontal" ? "horizontal" : "vertical";
  } catch {
    return "vertical";
  }
}
