import { describe, expect, it } from "vitest";
import {
  buildReplyPreview,
  getAuthorMutationView,
  getMessageContentView,
  summarizeReactions
} from "./messageMetadata";

describe("messageMetadata", () => {
  it("summarizes emoji reactions and the current user's reaction", () => {
    const summary = summarizeReactions(
      [
        { userId: "u1", reaction: "heart" },
        { userId: "u2", reaction: "heart" },
        { userId: "u3", reaction: "fire" },
        { userId: "u4", reaction: "poop" }
      ],
      "u3"
    );

    expect(summary).toEqual({
      likesCount: 0,
      dislikesCount: 0,
      reactionCounts: [
        { reaction: "heart", count: 2 },
        { reaction: "fire", count: 1 },
        { reaction: "poop", count: 1 }
      ],
      myReaction: "fire"
    });
  });

  it("builds a short reply preview", () => {
    const preview = buildReplyPreview({
      id: "m1",
      body: "Очень длинное сообщение, которое нужно аккуратно обрезать для превью ответа",
      user: {
        id: "u1",
        telegramId: "42",
        firstName: "Ivan",
        username: null,
        displayName: null,
        photoUrl: "https://example.com/avatar.jpg",
        avatarPositionX: 36,
        avatarPositionY: 64,
        avatarScale: 1.5
      }
    });

    expect(preview).toEqual({
      id: "m1",
      body: "Очень длинное сообщение, которое нужно аккуратно обрезать для превью...",
      author: {
        id: "u1",
        telegramId: "42",
        firstName: "Ivan",
        username: null,
        displayName: null,
        photoUrl: "https://example.com/avatar.jpg",
        avatarPositionX: 36,
        avatarPositionY: 64,
        avatarScale: 1.5
      }
    });
  });

  it("never exposes an author-deleted body to members or after moderator retention expires", () => {
    const deleted = {
      body: "секретный оригинал",
      deletedByUserAt: new Date("2026-07-29T10:00:00.000Z"),
      deletedContentExpiresAt: new Date("2026-08-28T10:00:00.000Z")
    };

    expect(getMessageContentView(deleted, "member", new Date("2026-07-30T00:00:00.000Z"))).toEqual({
      body: "Сообщение удалено",
      revealContent: false,
      purged: false,
      contentRedacted: true
    });
    expect(getMessageContentView(deleted, "admin", new Date("2026-08-27T23:59:59.999Z"))).toEqual({
      body: "секретный оригинал",
      revealContent: true,
      purged: false,
      contentRedacted: false
    });
    expect(getMessageContentView(deleted, "owner", new Date("2026-08-28T10:00:00.000Z"))).toEqual({
      body: "Сообщение удалено",
      revealContent: false,
      purged: true,
      contentRedacted: true
    });
  });

  it.each([
    ["2026-07-29T10:14:59.999Z", true],
    ["2026-07-29T10:15:00.000Z", true],
    ["2026-07-29T10:15:00.001Z", false]
  ])("derives exact author capabilities from server time at %s", (serverTime, allowed) => {
    const mutation = getAuthorMutationView({
      userId: "user-1",
      kind: "text",
      isSystem: false,
      status: "visible",
      createdAt: new Date("2026-07-29T10:00:00.000Z"),
      deletedByUserAt: null
    }, {
      currentUserId: "user-1",
      role: "member",
      topic: { isLocked: false, isPublished: true },
      serverNow: new Date(serverTime)
    });

    expect(mutation).toEqual({
      canEdit: allowed,
      canDelete: allowed,
      allowedUntil: "2026-07-29T10:15:00.000Z"
    });
  });

  it.each(["voice", "images", "video", "document", "poll"] as const)(
    "allows author deletion but not editing for %s messages",
    (kind) => {
      expect(getAuthorMutationView({
        userId: "user-1",
        kind,
        isSystem: false,
        status: "visible",
        createdAt: new Date("2026-07-29T10:00:00.000Z"),
        deletedByUserAt: null
      }, {
        currentUserId: "user-1",
        role: "member",
        topic: { isLocked: false, isPublished: true },
        serverNow: new Date("2026-07-29T10:05:00.000Z")
      })).toEqual({
        canEdit: false,
        canDelete: true,
        allowedUntil: "2026-07-29T10:15:00.000Z"
      });
    }
  );

  it("removes member author capabilities for a locked topic", () => {
    expect(getAuthorMutationView({
      userId: "user-1",
      kind: "text",
      isSystem: false,
      status: "visible",
      createdAt: new Date("2026-07-29T10:00:00.000Z"),
      deletedByUserAt: null
    }, {
      currentUserId: "user-1",
      role: "member",
      topic: { isLocked: true, isPublished: true },
      serverNow: new Date("2026-07-29T10:05:00.000Z")
    })).toEqual({ canEdit: false, canDelete: false, allowedUntil: null });
  });

  it("uses the role-aware body in reply previews", () => {
    const preview = buildReplyPreview({
      id: "m1",
      body: "оригинал",
      user: {
        id: "u1",
        telegramId: "42",
        firstName: "Ivan",
        username: null,
        displayName: null,
        photoUrl: null
      }
    }, "Сообщение удалено");

    expect(preview?.body).toBe("Сообщение удалено");
  });
});
