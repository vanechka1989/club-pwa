import { describe, expect, it } from "vitest";
import { resolveLessonEditorPreview, resolveLessonMaterialPreview } from "./lessonEditorPreview";

describe("lesson editor preview", () => {
  it("keeps the saved media visible until an editor selects a replacement", () => {
    expect(resolveLessonEditorPreview({
      kind: "audio",
      source: "file",
      existingUrl: "https://cdn.example.com/saved.mp3",
      externalUrl: "",
      localUrl: null
    })).toEqual({ url: "https://cdn.example.com/saved.mp3", origin: "saved" });
  });

  it("prefers a newly selected file over saved media", () => {
    expect(resolveLessonEditorPreview({
      kind: "video",
      source: "file",
      existingUrl: "https://cdn.example.com/saved.mp4",
      externalUrl: "",
      localUrl: "blob:replacement"
    })).toEqual({ url: "blob:replacement", origin: "new" });
  });

  it("previews external media and hides media for text lessons", () => {
    expect(resolveLessonEditorPreview({
      kind: "photo",
      source: "url",
      existingUrl: null,
      externalUrl: " https://cdn.example.com/photo.jpg ",
      localUrl: null
    })).toEqual({ url: "https://cdn.example.com/photo.jpg", origin: "external" });
    expect(resolveLessonEditorPreview({
      kind: "text",
      source: "file",
      existingUrl: "https://cdn.example.com/ignored.jpg",
      externalUrl: "",
      localUrl: null
    })).toBeNull();
  });
});

describe("lesson material editor preview", () => {
  it.each(["photo", "video", "audio"] as const)("shows saved %s content", (kind) => {
    expect(resolveLessonMaterialPreview({
      kind,
      source: "file",
      existingUrl: `https://cdn.example.com/saved-${kind}`,
      externalUrl: "",
      localUrl: null
    })).toEqual({ url: `https://cdn.example.com/saved-${kind}`, origin: "saved" });
  });

  it("shows an external or YouTube source", () => {
    expect(resolveLessonMaterialPreview({
      kind: "video",
      source: "youtube",
      existingUrl: null,
      externalUrl: " https://youtu.be/demo ",
      localUrl: null
    })).toEqual({ url: "https://youtu.be/demo", origin: "external" });
  });

  it("prefers a new local file and leaves text to its editor field", () => {
    expect(resolveLessonMaterialPreview({
      kind: "photo",
      source: "file",
      existingUrl: "https://cdn.example.com/saved.jpg",
      externalUrl: "",
      localUrl: "blob:new-photo"
    })).toEqual({ url: "blob:new-photo", origin: "new" });
    expect(resolveLessonMaterialPreview({
      kind: "text",
      source: "file",
      existingUrl: null,
      externalUrl: "",
      localUrl: null
    })).toBeNull();
  });
});
