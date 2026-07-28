import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("./http", () => ({
  api: mocks.api,
  apiUrl: "/api",
  getApiRequestHeaders: vi.fn(),
  previewModeStorageKey: "preview"
}));

import {
  createClubMessage,
  deleteCommunityMessage,
  editCommunityMessage,
  getCommunityParticipants
} from "./client";

const topicId = "00000000-0000-4000-8000-000000000010";
const messageId = "00000000-0000-4000-8000-000000000100";
const mentionedUserId = "00000000-0000-4000-8000-000000000002";

describe("community mutation API client", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps the caller's operation id and selected mentions in a retryable text payload", async () => {
    await createClubMessage(topicId, "@Анна привет", null, {
      clientOperationId: "device:operation-1",
      mentions: [{ userId: mentionedUserId, displayName: "Анна", start: 0, end: 5 }]
    });

    expect(mocks.api).toHaveBeenCalledWith(`/community/topics/${topicId}/messages`, {
      method: "POST",
      body: {
        body: "@Анна привет",
        replyToMessageId: null,
        clientOperationId: "device:operation-1",
        mentions: [{ userId: mentionedUserId, displayName: "Анна", start: 0, end: 5 }]
      }
    });
  });

  it("exposes edit, delete, and participant suggestion endpoints", async () => {
    await editCommunityMessage(messageId, { body: "Исправлено", mentions: [] });
    await deleteCommunityMessage(messageId);
    await getCommunityParticipants("Ан", 20);

    expect(mocks.api).toHaveBeenNthCalledWith(1, `/community/messages/${messageId}`, {
      method: "PATCH",
      body: { body: "Исправлено", mentions: [] }
    });
    expect(mocks.api).toHaveBeenNthCalledWith(2, `/community/messages/${messageId}`, { method: "DELETE" });
    expect(mocks.api).toHaveBeenNthCalledWith(3, "/community/participants", { query: { q: "Ан", limit: 20 } });
  });
});
