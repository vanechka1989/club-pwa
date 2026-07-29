import type { ClubMessage, CommunityDocumentAttachment, CommunityVideoAttachment } from "@club/shared";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";
import ChatFileMessage from "./ChatFileMessage.vue";
import ChatMessage from "./ChatMessage.vue";

function documentAttachment(overrides: Partial<CommunityDocumentAttachment> = {}): CommunityDocumentAttachment {
  return {
    id: "document-1",
    url: null,
    fileName: "guide.pdf",
    contentType: "application/pdf",
    sizeBytes: 2_097_152,
    expiresAt: "2099-07-30T00:00:00.000Z",
    deletedAt: null,
    scanStatus: "scanning",
    scannedAt: null,
    scanError: null,
    ...overrides
  };
}

function videoAttachment(overrides: Partial<CommunityVideoAttachment> = {}): CommunityVideoAttachment {
  return {
    id: "video-1",
    url: "https://objects.example.test/signed-video",
    fileName: "clip.mp4",
    contentType: "video/mp4",
    sizeBytes: 10,
    width: 1280,
    height: 720,
    durationSeconds: 12,
    expiresAt: "2099-07-30T00:00:00.000Z",
    deletedAt: null,
    scanStatus: "ready",
    scannedAt: "2026-07-29T00:00:00.000Z",
    scanError: null,
    ...overrides
  };
}

afterEach(cleanup);

describe("community file message", () => {
  it("is used by document chat messages without nesting another card", () => {
    const attachment = documentAttachment();
    const message = {
      id: "message-1",
      topicId: "topic-1",
      body: "Документ",
      kind: "document",
      voice: null,
      images: [],
      video: null,
      document: attachment,
      poll: null,
      isSystem: false,
      status: "visible",
      author: { id: "author-1", telegramId: "author@example.com", firstName: "Анна", username: null, displayName: "Анна", photoUrl: null, avatarPositionX: 50, avatarPositionY: 50, avatarScale: 1 },
      replyTo: null,
      likesCount: 0,
      dislikesCount: 0,
      reactionCounts: [],
      myReaction: null,
      authorMute: null,
      pinnedAt: null,
      editedAt: null,
      deletedByUserAt: null,
      contentRedacted: false,
      authorMutation: { canEdit: false, canDelete: false, allowedUntil: null },
      clientOperationId: null,
      mentions: [],
      createdAt: "2026-07-29T00:00:00.000Z"
    } satisfies ClubMessage;
    const { container } = render(ChatMessage, {
      props: { message, viewer: null, isModerator: false, messageSaving: false, highlighted: false }
    });
    expect(screen.getByText("Проверяем файл на вирусы")).toBeTruthy();
    expect(container.querySelector(".chat-file-message .ui-card, .chat-file-message .surface-card")).toBeNull();
  });

  it("keeps scanning documents in quarantine with a disabled download", () => {
    render(ChatFileMessage, { props: { kind: "document", attachment: documentAttachment() } });
    expect(screen.getByText("Проверяем файл на вирусы")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Скачать guide.pdf" })).toHaveProperty("disabled", true);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it.each([
    ["rejected", "Файл заблокирован: обнаружена угроза"],
    ["failed", "Проверка недоступна. Файл остаётся в карантине"],
    ["infected", "Файл заблокирован: обнаружена угроза"]
  ])("renders fail-closed %s state", (scanStatus, copy) => {
    render(ChatFileMessage, {
      props: { kind: "document", attachment: documentAttachment({ scanStatus: scanStatus as "rejected" }) }
    });
    expect(screen.getByText(copy)).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("opens only a ready server-issued HTTP(S) read URL", () => {
    const ready = render(ChatFileMessage, {
      props: {
        kind: "document",
        attachment: documentAttachment({
          scanStatus: "ready",
          url: "https://objects.example.test/signed-document?signature=private",
          scannedAt: "2026-07-29T00:00:00.000Z"
        })
      }
    });
    const link = screen.getByRole("link", { name: "Скачать guide.pdf" });
    expect(link.getAttribute("href")).toBe("https://objects.example.test/signed-document?signature=private");
    expect(link.getAttribute("rel")).toContain("noopener");
    ready.unmount();
    cleanup();

    render(ChatFileMessage, {
      props: {
        kind: "document",
        attachment: documentAttachment({ scanStatus: "ready", url: "javascript:alert(1)" })
      }
    });
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Ссылка на файл недоступна")).toBeTruthy();
  });

  it("renders a ready video with playsinline but hides expired and deleted objects", () => {
    const ready = render(ChatFileMessage, { props: { kind: "video", attachment: videoAttachment() } });
    const video = ready.container.querySelector("video");
    expect(video?.hasAttribute("playsinline")).toBe(true);
    expect(video?.getAttribute("src")).toBe("https://objects.example.test/signed-video");
    ready.unmount();
    cleanup();

    render(ChatFileMessage, {
      props: {
        kind: "video",
        attachment: videoAttachment({ expiresAt: "2020-01-01T00:00:00.000Z" })
      }
    });
    expect(screen.getByText("Файл удалён по сроку хранения")).toBeTruthy();
    expect(document.querySelector("video")).toBeNull();
  });

  it("never renders document HTML, SVG, iframe, object, or embed content", () => {
    const { container } = render(ChatFileMessage, {
      props: {
        kind: "document",
        attachment: documentAttachment({
          fileName: "<img src=x onerror=alert(1)>.html",
          contentType: "text/html",
          scanStatus: "ready",
          url: "data:text/html,<script>alert(1)</script>"
        })
      }
    });
    expect(container.querySelector("iframe, object, embed, img, script")).toBeNull();
    expect(container.innerHTML).not.toContain("onerror");
  });
});
