import { describe, expect, it } from "vitest";
import { communityMediaRetentionMs, getCommunityMediaExpiry, isCommunityAttachmentExpired } from "./mediaPolicy";

describe("community media retention", () => {
  it("expires user media after exactly 30 days", () => {
    const createdAt = new Date("2026-07-12T12:00:00.000Z");
    expect(getCommunityMediaExpiry("user", createdAt)?.getTime()).toBe(createdAt.getTime() + communityMediaRetentionMs);
  });

  it("keeps admin and owner media permanently based on upload role", () => {
    expect(getCommunityMediaExpiry("admin", new Date())).toBeNull();
    expect(getCommunityMediaExpiry("owner", new Date())).toBeNull();
  });

  it("only cleans due attachments that were not already deleted", () => {
    const now = new Date("2026-08-12T12:00:00.000Z");
    expect(isCommunityAttachmentExpired({ expiresAt: new Date("2026-08-01T00:00:00.000Z"), deletedAt: null }, now)).toBe(true);
    expect(isCommunityAttachmentExpired({ expiresAt: null, deletedAt: null }, now)).toBe(false);
    expect(isCommunityAttachmentExpired({ expiresAt: new Date("2026-08-01T00:00:00.000Z"), deletedAt: now }, now)).toBe(false);
  });
});
