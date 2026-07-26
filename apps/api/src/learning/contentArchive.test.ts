import { describe, expect, it } from "vitest";
import { getRestoredContentArchiveValues } from "./contentArchive";

describe("getRestoredContentArchiveValues", () => {
  it("restores archived content as a draft and clears its publication date", () => {
    const now = new Date("2026-06-26T01:00:00.000Z");
    const publishedAt = new Date("2026-06-25T01:00:00.000Z");

    expect(getRestoredContentArchiveValues({ publishedAt, now })).toEqual({
      isPublished: false,
      publishedAt: null,
      archivedUntil: null,
      updatedAt: now
    });
  });

  it("keeps unpublished archived content as a draft", () => {
    const now = new Date("2026-06-26T01:00:00.000Z");

    expect(getRestoredContentArchiveValues({ publishedAt: null, now })).toEqual({
      isPublished: false,
      publishedAt: null,
      archivedUntil: null,
      updatedAt: now
    });
  });
});
