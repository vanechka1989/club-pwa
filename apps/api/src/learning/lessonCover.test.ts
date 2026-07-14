import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getFirstVisualLessonCoverUrl } from "./lessonCover";

describe("getFirstVisualLessonCoverUrl", () => {
  it("uses the main photo before additional materials", () => {
    expect(
      getFirstVisualLessonCoverUrl(
        { kind: "photo", mediaUrl: "https://cdn.example.com/main.webp" },
        [{ kind: "photo", mediaUrl: "https://cdn.example.com/extra.webp" }]
      )
    ).toBe("https://cdn.example.com/main.webp");
  });

  it("uses the first visual additional material after non-visual entries", () => {
    expect(
      getFirstVisualLessonCoverUrl(
        { kind: "text", mediaUrl: null },
        [
          { kind: "audio", mediaUrl: "https://cdn.example.com/audio.mp3" },
          { kind: "photo", mediaUrl: "https://cdn.example.com/photo.webp" }
        ]
      )
    ).toBe("https://cdn.example.com/photo.webp");
  });

  it("uses a YouTube preview and ignores ordinary videos without a thumbnail", () => {
    expect(
      getFirstVisualLessonCoverUrl(
        { kind: "video", mediaUrl: "https://youtu.be/dQw4w9WgXcQ" },
        []
      )
    ).toBe("https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
    expect(
      getFirstVisualLessonCoverUrl(
        { kind: "video", mediaUrl: "https://cdn.example.com/video.mp4" },
        []
      )
    ).toBeNull();
  });

  it("migrates existing uploaded covers to custom mode", () => {
    const migration = readFileSync(resolve(process.cwd(), "drizzle/0042_lesson_cover_mode.sql"), "utf8");

    expect(migration).toContain('ADD COLUMN "cover_mode"');
    expect(migration).toContain("SET \"cover_mode\" = 'custom'");
    expect(migration).toContain('"thumbnail_object_key" IS NOT NULL');
  });
});
