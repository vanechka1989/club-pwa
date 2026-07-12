import { describe, expect, it } from "vitest";
import { clubMessageSchema } from "./index";

const base = {
  id: "message-1",
  topicId: "topic-1",
  body: "",
  isSystem: false,
  status: "visible",
  author: { id: "user-1", telegramId: "web:user-1", firstName: "Иван", username: null, photoUrl: null },
  replyTo: null,
  likesCount: 0,
  dislikesCount: 0,
  reactionCounts: [],
  myReaction: null,
  authorMute: null,
  pinnedAt: null,
  createdAt: new Date().toISOString()
};

describe("club message media contracts", () => {
  it("parses text, voice, image gallery, and poll messages", () => {
    expect(clubMessageSchema.parse({ ...base, kind: "text", body: "Привет", voice: null, images: [], poll: null }).kind).toBe("text");
    expect(
      clubMessageSchema.parse({
        ...base,
        kind: "voice",
        voice: { id: "a1", url: "https://cdn.test/voice.webm", contentType: "audio/webm", sizeBytes: 100, durationSeconds: 8, expiresAt: null, deletedAt: null },
        images: [],
        poll: null
      }).voice?.durationSeconds
    ).toBe(8);
    expect(
      clubMessageSchema.parse({
        ...base,
        kind: "images",
        voice: null,
        images: [{ id: "i1", url: "https://cdn.test/image.webp", contentType: "image/webp", sizeBytes: 200, width: 800, height: 600, expiresAt: null, deletedAt: null }],
        poll: null
      }).images
    ).toHaveLength(1);
    expect(
      clubMessageSchema.parse({
        ...base,
        kind: "poll",
        voice: null,
        images: [],
        poll: { id: "p1", question: "Выбор?", allowsMultiple: false, isAnonymous: true, closesAt: null, closedAt: null, totalVoters: 0, options: [{ id: "o1", text: "Да", votesCount: 0, percent: 0, selected: false }], voterDetails: null }
      }).poll?.question
    ).toBe("Выбор?");
  });
});
