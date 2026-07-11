import { describe, expect, it } from "vitest";
import { buildReplyPreview, summarizeReactions } from "./messageMetadata";

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
});
