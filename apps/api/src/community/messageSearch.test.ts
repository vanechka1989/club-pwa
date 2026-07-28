import { describe, expect, it } from "vitest";
import {
  buildSearchExcerpt,
  buildSearchTokens,
  decodeSearchCursor,
  encodeSearchCursor,
  isMessageDiscoverable,
  normalizeSearchLimit
} from "./messageSearch";

describe("community message search", () => {
  it("normalizes whitespace into PostgreSQL search tokens", () => {
    expect(buildSearchTokens("  привет   анна ")).toEqual(["привет", "анна"]);
  });

  it("caps result pages at 50", () => {
    expect(normalizeSearchLimit(500)).toBe(50);
    expect(normalizeSearchLimit(0)).toBe(1);
  });

  it("round-trips a stable timestamp and UUID cursor and rejects malformed cursors", () => {
    const cursor = {
      createdAt: "2026-07-28T12:00:00.123456Z",
      messageId: "00000000-0000-4000-8000-000000000102"
    };

    expect(decodeSearchCursor(encodeSearchCursor(cursor))).toEqual(cursor);
    const legacyCursor = { ...cursor, messageId: "00000000-0000-0000-0000-000000000001" };
    expect(decodeSearchCursor(encodeSearchCursor(legacyCursor))).toEqual(legacyCursor);
    expect(decodeSearchCursor("not-a-valid-cursor")).toBeNull();
    expect(decodeSearchCursor(Buffer.from("2026-07-28T12:00:00.000Z|not-a-uuid").toString("base64url"))).toBeNull();
    expect(decodeSearchCursor(Buffer.from(`2026-02-31T12:00:00.123456Z|${cursor.messageId}`).toString("base64url"))).toBeNull();
    expect(decodeSearchCursor(Buffer.from(`0000-01-01T00:00:00.000000Z|${cursor.messageId}`).toString("base64url"))).toBeNull();
  });

  it("keeps member searches from discovering restricted content", () => {
    const visible = {
      role: "member" as const,
      topic: { isAdminOnly: false, isPublished: true },
      message: { status: "visible" as const, deletedByUserAt: null },
      hasQuarantinedAttachment: false
    };

    expect(isMessageDiscoverable(visible)).toBe(true);
    expect(isMessageDiscoverable({ ...visible, topic: { ...visible.topic, isAdminOnly: true } })).toBe(false);
    expect(isMessageDiscoverable({ ...visible, topic: { ...visible.topic, isPublished: false } })).toBe(false);
    expect(isMessageDiscoverable({ ...visible, message: { ...visible.message, status: "hidden" } })).toBe(false);
    expect(isMessageDiscoverable({ ...visible, message: { ...visible.message, status: "deleted" } })).toBe(false);
    expect(isMessageDiscoverable({ ...visible, message: { ...visible.message, deletedByUserAt: new Date() } })).toBe(false);
    expect(isMessageDiscoverable({ ...visible, hasQuarantinedAttachment: true })).toBe(false);
  });

  it("creates a bounded text-only highlighted excerpt", () => {
    const excerpt = buildSearchExcerpt(`<script>alert(1)</script> ${"начало ".repeat(90)}привет анна`, ["привет", "анна"]);

    expect(excerpt.length).toBeLessThanOrEqual(500);
    expect(excerpt).toContain("【привет】");
    expect(excerpt).not.toContain("<script>");
    expect(excerpt).not.toMatch(/<\/?(?:mark|b)>/i);
  });
});
