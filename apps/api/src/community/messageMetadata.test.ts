import { describe, expect, it } from "vitest";
import { buildReplyPreview, summarizeReactions } from "./messageMetadata";

describe("messageMetadata", () => {
  it("summarizes likes, dislikes and the current user's reaction", () => {
    const summary = summarizeReactions(
      [
        { userId: "u1", reaction: "like" },
        { userId: "u2", reaction: "like" },
        { userId: "u3", reaction: "dislike" }
      ],
      "u3"
    );

    expect(summary).toEqual({
      likesCount: 2,
      dislikesCount: 1,
      myReaction: "dislike"
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
        username: null
      }
    });

    expect(preview).toEqual({
      id: "m1",
      body: "Очень длинное сообщение, которое нужно аккуратно обрезать для превью...",
      author: {
        id: "u1",
        telegramId: "42",
        firstName: "Ivan",
        username: null
      }
    });
  });
});
