import { describe, expect, it } from "vitest";
import {
  getArchivedCategoryItemValues,
  getArchivedCategoryValues,
  getCategoryRestoreState,
  getRestoredCategoryItemValues,
  getRestoredCategoryValues
} from "./categoryArchive";

describe("learning category archive policy", () => {
  const now = new Date("2026-07-26T12:00:00.000Z");
  const expiresAt = new Date("2026-08-02T12:00:00.000Z");

  it("archives a category and its lessons for exactly seven days as unpublished content", () => {
    expect(getArchivedCategoryValues(now)).toEqual({
      isPublished: false,
      archivedUntil: expiresAt,
      updatedAt: now
    });
    expect(getArchivedCategoryItemValues(now)).toEqual({
      isPublished: false,
      publishedAt: null,
      archivedUntil: expiresAt,
      updatedAt: now
    });
  });

  it("restores a category and its lessons as drafts without publishing them", () => {
    expect(getRestoredCategoryValues(now)).toEqual({
      isPublished: false,
      archivedUntil: null,
      updatedAt: now
    });
    expect(getRestoredCategoryItemValues(now)).toEqual({
      isPublished: false,
      publishedAt: null,
      archivedUntil: null,
      updatedAt: now
    });
  });

  it("distinguishes active, restorable, and expired categories", () => {
    expect(getCategoryRestoreState(null, now)).toBe("active");
    expect(getCategoryRestoreState(new Date("2026-07-27T12:00:00.000Z"), now)).toBe("restorable");
    expect(getCategoryRestoreState(now, now)).toBe("expired");
    expect(getCategoryRestoreState(new Date("2026-07-25T12:00:00.000Z"), now)).toBe("expired");
  });
});
