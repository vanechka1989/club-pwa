import { describe, expect, it } from "vitest";
import { getArchiveExpirationDate, isTopicVisibleForRole } from "./topicArchive";

describe("topicArchive", () => {
  it("keeps archived topics visible only to admins during the restore window", () => {
    const now = new Date("2026-06-23T12:00:00.000Z");
    const archivedUntil = new Date("2026-06-24T12:00:00.000Z");

    expect(isTopicVisibleForRole({ isPublished: false, archivedUntil }, "member", now)).toBe(false);
    expect(isTopicVisibleForRole({ isPublished: false, archivedUntil }, "admin", now)).toBe(true);
    expect(isTopicVisibleForRole({ isPublished: false, archivedUntil }, "owner", now)).toBe(true);
  });

  it("hides expired archived topics from admins", () => {
    const now = new Date("2026-06-23T12:00:00.000Z");
    const archivedUntil = new Date("2026-06-22T12:00:00.000Z");

    expect(isTopicVisibleForRole({ isPublished: false, archivedUntil }, "admin", now)).toBe(false);
  });

  it("sets archive expiration to seven days", () => {
    expect(getArchiveExpirationDate(new Date("2026-06-23T12:00:00.000Z")).toISOString()).toBe(
      "2026-06-30T12:00:00.000Z"
    );
  });
});
