import { describe, expect, it } from "vitest";
import {
  buildSearchExcerpt,
  buildSearchTokens,
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
