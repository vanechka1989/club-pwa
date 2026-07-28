import { describe, expect, it } from "vitest";
import * as shared from "./index";

const topicFixture = {
  id: "topic-1",
  chatId: "chat-1",
  title: "Общение",
  description: null,
  isPinned: false,
  isLocked: false,
  isPublished: true,
  isAdminOnly: false,
  archivedUntil: null,
  messagesCount: 4,
  latestReplyToMeAt: null,
  createdAt: "2026-07-28T00:00:00.000Z"
};

const messageFixture = {
  id: "message-1",
  topicId: "topic-1",
  body: "Привет, Анна",
  kind: "text",
  voice: null,
  images: [],
  poll: null,
  isSystem: false,
  status: "visible",
  author: {
    id: "user-1",
    telegramId: "web:user-1",
    firstName: "Иван",
    username: null,
    photoUrl: null
  },
  replyTo: null,
  likesCount: 0,
  dislikesCount: 0,
  reactionCounts: [],
  myReaction: null,
  authorMute: null,
  pinnedAt: null,
  createdAt: "2026-07-28T00:00:00.000Z"
};

const userId = "11111111-1111-4111-8111-111111111111";
const topicId = "22222222-2222-4222-8222-222222222222";
const messageId = "33333333-3333-4333-8333-333333333333";
const operationId = "device-1:message-1";

function schema<T>(name: keyof typeof shared) {
  const value = shared[name] as unknown as { parse(input: unknown): T; safeParse(input: unknown): { success: boolean } } | undefined;
  expect(value, `${String(name)} must be exported`).toBeDefined();
  return value!;
}

describe("reliable community chat contracts", () => {
  it("parses synchronized topic state", () => {
    const parsed = shared.clubTopicSchema.parse({
      ...topicFixture,
      unreadCount: 3,
      notificationMode: "mentions"
    });

    expect(parsed.unreadCount).toBe(3);
    expect(parsed.notificationMode).toBe("mentions");
  });

  it("parses edited and user-deleted messages with mentions", () => {
    const parsed = shared.clubMessageSchema.parse({
      ...messageFixture,
      editedAt: "2026-07-28T01:00:00.000Z",
      deletedByUserAt: null,
      clientOperationId: operationId,
      mentions: [{ userId, displayName: "Анна", start: 7, end: 12 }]
    });

    expect(parsed.editedAt).toBe("2026-07-28T01:00:00.000Z");
    expect(parsed.deletedByUserAt).toBeNull();
    expect(parsed.clientOperationId).toBe(operationId);
    expect(parsed.mentions[0]?.displayName).toBe("Анна");
  });

  it("parses attachment scan state", () => {
    const parsed = shared.clubMessageSchema.parse({
      ...messageFixture,
      kind: "images",
      images: [
        {
          id: "attachment-1",
          url: null,
          fileName: "photo.webp",
          contentType: "image/webp",
          sizeBytes: 512,
          width: 640,
          height: 480,
          expiresAt: null,
          deletedAt: null,
          scanStatus: "pending",
          scannedAt: null,
          scanError: null
        }
      ]
    });

    expect(parsed.images[0]?.scanStatus).toBe("pending");
    expect(parsed.images[0]?.fileName).toBe("photo.webp");
  });

  it("accepts only supported notification modes and bounded search queries", () => {
    const notificationMode = schema<string>("communityNotificationModeSchema");
    const searchQuery = schema<{ q: string; limit: number }>("communityMessageSearchQuerySchema");

    expect(notificationMode.parse("off")).toBe("off");
    expect(notificationMode.safeParse("important").success).toBe(false);
    expect(searchQuery.parse({ q: "  Анна  " })).toEqual({ q: "Анна", limit: 20 });
    expect(searchQuery.safeParse({ q: "а" }).success).toBe(false);
  });

  it("parses read position and notification setting exchanges", () => {
    const readRequest = schema<{ lastReadMessageId: string | null }>("communityTopicReadPositionRequestSchema");
    const readResponse = schema<{ unreadCount: number }>("communityTopicReadPositionResponseSchema");
    const settingsRequest = schema<{ mode: string }>("communityTopicNotificationSettingsRequestSchema");
    const settingsResponse = schema<{ mode: string }>("communityTopicNotificationSettingsResponseSchema");

    expect(readRequest.parse({ lastReadMessageId: messageId }).lastReadMessageId).toBe(messageId);
    expect(
      readResponse.parse({
        ok: true,
        topicId,
        lastReadMessageId: messageId,
        lastReadAt: "2026-07-28T01:00:00.000Z",
        unreadCount: 0
      }).unreadCount
    ).toBe(0);
    expect(settingsRequest.parse({ mode: "all" }).mode).toBe("all");
    expect(
      settingsResponse.parse({
        ok: true,
        topicId,
        mode: "mentions",
        updatedAt: "2026-07-28T01:00:00.000Z"
      }).mode
    ).toBe("mentions");
  });

  it("parses search, edit, delete, and participant suggestion contracts", () => {
    const searchResponse = schema<{ messages: unknown[]; nextCursor: string | null }>("communityMessageSearchResponseSchema");
    const editRequest = schema<{ body: string; mentions: unknown[] }>("communityMessageEditRequestSchema");
    const editResponse = schema<{ ok: boolean }>("communityMessageEditResponseSchema");
    const deleteResponse = schema<{ ok: boolean }>("communityMessageDeleteResponseSchema");
    const participantQuery = schema<{ q: string; limit: number }>("communityParticipantSuggestionsQuerySchema");
    const participantResponse = schema<{ participants: unknown[] }>("communityParticipantSuggestionsResponseSchema");

    expect(searchResponse.parse({ messages: [], nextCursor: null })).toEqual({ messages: [], nextCursor: null });
    expect(editRequest.parse({ body: "  Новый текст  ", mentions: [] })).toEqual({ body: "Новый текст", mentions: [] });
    expect(editResponse.parse({ ok: true, message: messageFixture }).ok).toBe(true);
    expect(deleteResponse.parse({ ok: true, message: messageFixture }).ok).toBe(true);
    expect(participantQuery.parse({ q: "  Ан  " })).toEqual({ q: "Ан", limit: 10 });
    expect(participantResponse.parse({ participants: [] })).toEqual({ participants: [] });
  });

  it("parses direct upload intents and completed objects", () => {
    const uploadIntent = schema<{ fileName: string }>("communityUploadIntentSchema");
    const uploadIntentResponse = schema<{ uploadUrl: string }>("communityUploadIntentResponseSchema");
    const uploadedObject = schema<{ objectKey: string; uploadToken: string }>("communityUploadedObjectSchema");
    const input = { fileName: "voice.webm", contentType: "audio/webm", sizeBytes: 1024 };

    expect(uploadIntent.parse(input).fileName).toBe("voice.webm");
    expect(
      uploadIntentResponse.parse({
        objectKey: "community/user-1/voice.webm",
        uploadToken: userId,
        contentType: "audio/webm",
        sizeBytes: 1024,
        uploadUrl: "https://uploads.example.test/voice.webm",
        expiresAt: "2026-07-28T01:00:00.000Z"
      }).uploadUrl
    ).toContain("uploads.example.test");
    expect(
      uploadedObject.parse({
        ...input,
        objectKey: "community/user-1/voice.webm",
        uploadToken: userId
      }).objectKey
    ).toBe("community/user-1/voice.webm");
  });
});
