import { describe, expect, it } from "vitest";
import { getRestoredContentArchiveValues } from "./contentArchive";

describe("getRestoredContentArchiveValues", () => {
  it("restores archived content and keeps an existing publication date", () => {
    const now = new Date("2026-06-26T01:00:00.000Z");
    const publishedAt = new Date("2026-06-25T01:00:00.000Z");

    expect(getRestoredContentArchiveValues({ publishedAt, now })).toEqual({
      isPublished: true,
      publishedAt,
      archivedUntil: null,
      updatedAt: now
    });
  });

  it("sets a publication date when restoring unpublished archived content", () => {
    const now = new Date("2026-06-26T01:00:00.000Z");

    expect(getRestoredContentArchiveValues({ publishedAt: null, now })).toEqual({
      isPublished: true,
      publishedAt: now,
      archivedUntil: null,
      updatedAt: now
    });
  });
});
