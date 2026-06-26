export const moduleCategoryDescriptionPrefix = "__club_module__";

export function encodeModuleCategoryDescription(description?: string | null) {
  const cleanDescription = description?.trim() ?? "";

  return cleanDescription ? `${moduleCategoryDescriptionPrefix}\n${cleanDescription}` : moduleCategoryDescriptionPrefix;
}

export function isModuleCategoryDescription(description: string | null) {
  return description?.startsWith(moduleCategoryDescriptionPrefix) ?? false;
}

export function decodeModuleCategoryDescription(description: string | null) {
  if (!isModuleCategoryDescription(description)) {
    return description;
  }

  const decoded = description?.slice(moduleCategoryDescriptionPrefix.length).replace(/^\n/, "").trim() ?? "";

  return decoded || null;
}
