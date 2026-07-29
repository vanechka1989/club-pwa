import { describe, expect, it } from "vitest";
import {
  createAdminCommunityViewer,
  projectAdminCommunityPollContent,
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

  it.each([
    { terminalCleanupAt: null, deletedContentExpiresAt: new Date("2026-07-30T09:30:00Z") },
    { terminalCleanupAt: new Date("2026-07-30T09:45:00Z"), deletedContentExpiresAt: new Date("2026-07-30T11:00:00Z") }
  ])("never projects raw poll fields after the parent retention fence", (parentFence) => {
    const viewer = createAdminCommunityViewer({
      isOwner: false,
      isActive: true,
      permissions: ["community"],
      role: "admin"
    });
    const projected = projectAdminCommunityPollContent({
      question: "secret poll question",
      options: [
        { id: "option-2", text: "secret second option", sortOrder: 2 },
        { id: "option-1", text: "secret first option", sortOrder: 1 }
      ],
      message: {
        ...message,
        deletedByUserAt: new Date("2026-07-30T09:00:00Z"),
        ...parentFence
      }
    }, viewer, new Date("2026-07-30T10:00:00Z"));
    expect(projected).toBeNull();
    expect(JSON.stringify(projected)).not.toContain("secret");
  });

  it("projects poll fields only while the parent content is retained", () => {
    const viewer = createAdminCommunityViewer({
      isOwner: true,
      isActive: true,
      permissions: [],
      role: "owner"
    });
    expect(projectAdminCommunityPollContent({
      question: "retained question",
      options: [
        { id: "b", text: "Second", sortOrder: 2 },
        { id: "a", text: "First", sortOrder: 1 }
      ],
      message: {
        ...message,
        deletedByUserAt: new Date("2026-07-30T09:00:00Z"),
        deletedContentExpiresAt: new Date("2026-07-30T10:30:00Z"),
        terminalCleanupAt: null
      }
    }, viewer, new Date("2026-07-30T10:00:00Z"))).toEqual({
      question: "retained question",
      options: [
        { id: "a", text: "First", sortOrder: 1 },
        { id: "b", text: "Second", sortOrder: 2 }
      ]
    });
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
