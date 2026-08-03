import { sanitizeHtml } from "@/utils/sanitizeHtml";

export function prepareLearningHtml(value: string | null | undefined) {
  return sanitizeHtml(value ?? "")
    .trim()
    .replace(/\r\n?/g, "\n")
    .replace(/\n/g, "<br>");
}
