import type { ContentKind } from "@club/shared";
import type { MediaInputSource } from "./materialForm";

type LessonEditorPreviewInput = {
  kind: ContentKind;
  source: MediaInputSource;
  existingUrl: string | null;
  externalUrl: string;
  localUrl: string | null;
};

export type LessonEditorPreview = {
  url: string;
  origin: "saved" | "external" | "new";
};

export function resolveLessonEditorPreview(input: LessonEditorPreviewInput): LessonEditorPreview | null {
  if (input.kind === "text") return null;
  if (input.localUrl) return { url: input.localUrl, origin: "new" };

  if (input.source !== "file") {
    const externalUrl = input.externalUrl.trim();
    return externalUrl ? { url: externalUrl, origin: "external" } : null;
  }

  return input.existingUrl ? { url: input.existingUrl, origin: "saved" } : null;
}

export const resolveLessonMaterialPreview = resolveLessonEditorPreview;
