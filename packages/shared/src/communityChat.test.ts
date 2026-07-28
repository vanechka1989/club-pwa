import { describe, expect, it } from "vitest";
import * as shared from "./index";

const MiB = 1024 * 1024;
const userId = "11111111-1111-4111-8111-111111111111";
const topicId = "22222222-2222-4222-8222-222222222222";
const messageId = "33333333-3333-4333-8333-333333333333";

const author = {
  id: userId,
  telegramId: "web:user-1",
  firstName: "Иван",
  username: null,
  photoUrl: null
};

const topicFixture = {
  id: topicId,
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
  id: messageId,
  topicId,
  body: "Привет, Анна",
  kind: "text",
  voice: null,
  images: [],
  poll: null,
  isSystem: false,
  status: "visible",
  author,
  replyTo: null,
  likesCount: 0,
  dislikesCount: 0,
  reactionCounts: [],
  myReaction: null,
  authorMute: null,
  pinnedAt: null,
  createdAt: "2026-07-28T00:00:00.000Z"
};

function contract<T>(name: keyof typeof shared) {
  const value = shared[name] as unknown as { parse(input: unknown): T; safeParse(input: unknown): { success: boolean } } | undefined;
  expect(value, `${String(name)} must be exported`).toBeDefined();
  return value!;
}

describe("reliable community chat state", () => {
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
      clientOperationId: "device-1:message-1",
      mentions: [{ userId, displayName: "Анна", start: 7, end: 12 }]
    });

    expect(parsed.editedAt).toBe("2026-07-28T01:00:00.000Z");
    expect(parsed.deletedByUserAt).toBeNull();
    expect(parsed.mentions[0]?.displayName).toBe("Анна");
  });

  it("supports the complete attachment lifecycle and rejects unknown states", () => {
    const scanStatus = contract<string>("communityAttachmentScanStatusSchema");

    for (const status of ["pending", "scanning", "ready", "rejected", "failed", "deleted"]) {
      expect(scanStatus.parse(status)).toBe(status);
    }
    expect(scanStatus.safeParse("infected").success).toBe(false);
  });

  it("serializes video and fail-closed document attachments", () => {
    const video = {
      id: "video-1",
      url: "https://cdn.example.test/video.mp4",
      fileName: "video.mp4",
      contentType: "video/mp4",
      sizeBytes: 10 * MiB,
      width: 1920,
      height: 1080,
      durationSeconds: 60,
      expiresAt: null,
      deletedAt: null,
      scanStatus: "ready",
      scannedAt: "2026-07-28T01:00:00.000Z",
      scanError: null
    };
    const document = {
      id: "document-1",
      url: null,
      fileName: "guide.pdf",
      contentType: "application/pdf",
      sizeBytes: MiB,
      expiresAt: null,
      deletedAt: null,
      scanStatus: "pending",
      scannedAt: null,
      scanError: null
    };
    const videoMessage = shared.clubMessageSchema.parse({ ...messageFixture, kind: "video", video });
    const documentMessage = shared.clubMessageSchema.parse({ ...messageFixture, kind: "document", document });

    expect(videoMessage.video?.durationSeconds).toBe(60);
    expect(documentMessage.document?.scanStatus).toBe("pending");
    expect(
      shared.clubMessageSchema.safeParse({
        ...messageFixture,
        kind: "document",
        document: { ...document, url: "https://cdn.example.test/unsafe.pdf" }
      }).success
    ).toBe(false);
  });
});

describe("read, notification, and search contracts", () => {
  it("accepts a read messageId and returns authoritative topic state from both mutations", () => {
    const readRequest = contract<{ messageId: string }>("communityTopicReadPositionRequestSchema");
    const readResponse = contract<Record<string, unknown>>("communityTopicReadPositionResponseSchema");
    const notificationResponse = contract<Record<string, unknown>>("communityTopicNotificationSettingsResponseSchema");
    const state = {
      unreadCount: 0,
      lastReadMessageId: messageId,
      notificationMode: "mentions"
    };

    expect(readRequest.parse({ messageId })).toEqual({ messageId });
    expect(readRequest.safeParse({ lastReadMessageId: messageId }).success).toBe(false);
    expect(readResponse.parse(state)).toEqual(state);
    expect(notificationResponse.parse(state)).toEqual(state);
  });

  it("returns only bounded safe search result fields", () => {
    const resultSchema = contract<Record<string, unknown>>("communityMessageSearchResultSchema");
    const responseSchema = contract<{ results: Record<string, unknown>[] }>("communityMessageSearchResponseSchema");
    const result = {
      messageId,
      topicId,
      topicTitle: "Общение",
      author,
      excerpt: "Совпавший фрагмент",
      createdAt: "2026-07-28T00:00:00.000Z",
      body: "Секретный полный текст",
      attachments: [{ objectKey: "private/key" }]
    };

    expect(resultSchema.parse(result)).toEqual({
      messageId,
      topicId,
      topicTitle: "Общение",
      author: { ...author, avatarPositionX: 50, avatarPositionY: 50, avatarScale: 1 },
      excerpt: "Совпавший фрагмент",
      createdAt: "2026-07-28T00:00:00.000Z"
    });
    expect(responseSchema.parse({ results: [result], nextCursor: null }).results).toHaveLength(1);
    expect(responseSchema.safeParse({ messages: [messageFixture], nextCursor: null }).success).toBe(false);
  });

  it("keeps search queries bounded", () => {
    expect(shared.communityMessageSearchQuerySchema.parse({ q: "  Анна  " })).toEqual({ q: "Анна", limit: 20 });
    expect(shared.communityMessageSearchQuerySchema.safeParse({ q: "а" }).success).toBe(false);
    expect(shared.communityMessageSearchQuerySchema.safeParse({ q: "Анна", limit: 51 }).success).toBe(false);
  });
});

describe("discriminated community upload contracts", () => {
  it("enforces exact image MIME types, 15 MiB per image, and 10 images per batch", () => {
    const intent = contract<Record<string, unknown>>("communityUploadIntentSchema");
    const batch = contract<unknown[]>("communityImageUploadBatchSchema");
    const image = { kind: "image", fileName: "photo.webp", contentType: "image/webp", sizeBytes: 15 * MiB };

    for (const contentType of ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]) {
      expect(intent.safeParse({ ...image, contentType }).success).toBe(true);
    }
    expect(intent.safeParse({ ...image, sizeBytes: 15 * MiB + 1 }).success).toBe(false);
    expect(intent.safeParse({ ...image, contentType: "image/svg+xml" }).success).toBe(false);
    expect(batch.parse(Array.from({ length: 10 }, () => image))).toHaveLength(10);
    expect(batch.safeParse(Array.from({ length: 11 }, () => image)).success).toBe(false);
  });

  it("enforces voice MIME, 30 MiB, and five-minute duration limits", () => {
    const intent = contract<Record<string, unknown>>("communityUploadIntentSchema");
    const voice = {
      kind: "voice",
      fileName: "voice.webm",
      contentType: "audio/webm",
      sizeBytes: 30 * MiB,
      durationSeconds: 300
    };

    for (const contentType of [
      "audio/webm",
      "audio/mp4",
      "audio/ogg",
      "audio/mpeg",
      "audio/aac",
      "audio/wav",
      "audio/x-wav",
      "video/mp4"
    ]) {
      expect(intent.safeParse({ ...voice, contentType }).success).toBe(true);
    }
    expect(intent.safeParse({ ...voice, sizeBytes: 30 * MiB + 1 }).success).toBe(false);
    expect(intent.safeParse({ ...voice, durationSeconds: 301 }).success).toBe(false);
    expect(intent.safeParse({ ...voice, contentType: "audio/x-msdownload" }).success).toBe(false);
  });

  it("accepts bounded MP4/MOV/WebM videos and office documents", () => {
    const intent = contract<Record<string, unknown>>("communityUploadIntentSchema");
    const video = { kind: "video", fileName: "clip.mp4", contentType: "video/mp4", sizeBytes: 100 * MiB };
    const document = { kind: "document", fileName: "guide.pdf", contentType: "application/pdf", sizeBytes: 50 * MiB };
    const documentTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    ];

    for (const contentType of ["video/mp4", "video/quicktime", "video/webm"]) {
      expect(intent.safeParse({ ...video, contentType }).success).toBe(true);
    }
    for (const contentType of documentTypes) {
      expect(intent.safeParse({ ...document, contentType }).success).toBe(true);
    }
    expect(intent.safeParse({ ...video, sizeBytes: 100 * MiB + 1 }).success).toBe(false);
    expect(intent.safeParse({ ...document, sizeBytes: 50 * MiB + 1 }).success).toBe(false);
    expect(intent.safeParse({ ...document, contentType: "application/zip" }).success).toBe(false);
  });

  it("represents presigned PUT and multipart upload sessions", () => {
    const response = contract<Record<string, unknown>>("communityUploadIntentResponseSchema");
    const common = {
      kind: "video",
      objectKey: "community/video/video-1.mp4",
      uploadToken: userId,
      contentType: "video/mp4",
      sizeBytes: 100 * MiB,
      expiresAt: "2026-07-28T01:00:00.000Z"
    };

    expect(
      response.parse({ ...common, uploadType: "put", uploadUrl: "https://uploads.example.test/video.mp4" }).uploadType
    ).toBe("put");
    expect(
      response.parse({
        ...common,
        uploadType: "multipart",
        uploadId: "upload-1",
        partSizeBytes: 8 * MiB,
        parts: [{ partNumber: 1, uploadUrl: "https://uploads.example.test/part-1" }]
      }).uploadType
    ).toBe("multipart");
    expect(response.safeParse({ ...common, uploadType: "multipart", uploadId: "upload-1", parts: [] }).success).toBe(false);
  });

  it("preserves kind in completed upload objects", () => {
    const completed = contract<{ kind: string }>("communityUploadedObjectSchema");
    const parsed = completed.parse({
      kind: "document",
      fileName: "guide.pdf",
      contentType: "application/pdf",
      sizeBytes: MiB,
      objectKey: "community/documents/guide.pdf",
      uploadToken: userId
    });

    expect(parsed.kind).toBe("document");
  });
});
