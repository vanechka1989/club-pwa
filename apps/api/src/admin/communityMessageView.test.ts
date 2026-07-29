import { describe, expect, it } from "vitest";
import {
  createAdminCommunityViewer,
  projectAdminCommunityModerationMessage,
  sortAdminTimelineNewestFirst
} from "./communityMessageView";

const message = {
  id: "00000000-0000-4000-8000-000000000011",
  body: "private moderation evidence",
  status: "hidden" as const,
  deletedByUserAt: null,
  deletedContentExpiresAt: null,
  preciseCreatedAt: "2026-07-30T10:00:00.123456Z",
  createdAt: new Date("2026-07-30T10:00:00.123Z"),
  topic: { title: "Admin room", isAdminOnly: true, isPublished: true }
};

describe("admin community message projection", () => {
  it.each(["materials", "statistics", "users"] as const)(
    "does not expose admin-only or hidden chat to a %s-only admin",
    (permission) => {
      const viewer = createAdminCommunityViewer({
        isOwner: false,
        isActive: true,
        permissions: [permission],
        role: "admin"
      });
      expect(projectAdminCommunityModerationMessage(message, viewer, new Date())).toBeNull();
    }
  );

  it("fails closed after community permission is revoked", () => {
    const viewer = createAdminCommunityViewer({
      isOwner: false,
      isActive: false,
      permissions: ["community"],
      role: "member"
    });
    expect(projectAdminCommunityModerationMessage(message, viewer, new Date())).toBeNull();
  });

  it("uses role-aware redaction and never returns expired author-deleted content", () => {
    const viewer = createAdminCommunityViewer({
      isOwner: false,
      isActive: true,
      permissions: ["community"],
      role: "admin"
    });
    const projected = projectAdminCommunityModerationMessage({
      ...message,
      status: "deleted",
      deletedByUserAt: new Date("2026-07-30T09:00:00Z"),
      deletedContentExpiresAt: new Date("2026-07-30T09:30:00Z")
    }, viewer, new Date("2026-07-30T10:00:00Z"));
    expect(projected).toMatchObject({
      body: "Сообщение удалено",
      createdAt: "2026-07-30T10:00:00.123456Z"
    });
    expect(projected?.body).not.toContain("private moderation evidence");
  });

  it("orders mixed millisecond and microsecond timestamps chronologically, then by id", () => {
    const rows = [
      { id: "b", createdAt: "2026-07-30T10:00:00.123Z" },
      { id: "a", createdAt: "2026-07-30T10:00:00.123456Z" },
      { id: "c", createdAt: "2026-07-30T10:00:00.123456Z" }
    ];
    expect(rows.sort(sortAdminTimelineNewestFirst).map((row) => row.id)).toEqual(["c", "a", "b"]);
  });
});
