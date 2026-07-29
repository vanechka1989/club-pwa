import type { ClubMessage, CommunityDocumentAttachment, CommunityVideoAttachment } from "@club/shared";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/vue";
import { nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

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

  it("refreshes a ready document URL when the user activates the download", async () => {
    const refreshUrl = vi.fn().mockResolvedValue("https://objects.example.test/fresh-document?signature=new");
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    render(ChatFileMessage, {
      props: {
        kind: "document",
        attachment: documentAttachment({
          scanStatus: "ready",
          url: "https://objects.example.test/stale-document?signature=old",
          scannedAt: "2026-07-29T00:00:00.000Z"
        }),
        refreshUrl
      }
    });
    expect(screen.queryByRole("link")).toBeNull();
    await fireEvent.click(screen.getByRole("button", { name: "Скачать guide.pdf" }));
    await waitFor(() => expect(refreshUrl).toHaveBeenCalledTimes(1));
    expect(open).toHaveBeenCalledWith("https://objects.example.test/fresh-document?signature=new", "_blank", "noopener,noreferrer");
  });

  it("rejects unsafe refreshed document URLs", async () => {
    render(ChatFileMessage, {
      props: {
        kind: "document",
        attachment: documentAttachment({ scanStatus: "ready", url: "https://objects.example.test/stale" }),
        refreshUrl: vi.fn().mockResolvedValue("javascript:alert(1)")
      }
    });
    await fireEvent.click(screen.getByRole("button", { name: "Скачать guide.pdf" }));
    expect(await screen.findByText("Ссылка на файл недоступна")).toBeTruthy();
  });

  it("refreshes a ready video URL on activation instead of loading the stale signed URL", async () => {
    const refreshUrl = vi.fn().mockResolvedValue("https://objects.example.test/fresh-video");
    const ready = render(ChatFileMessage, { props: { kind: "video", attachment: videoAttachment(), refreshUrl } });
    expect(ready.container.querySelector("video")).toBeNull();
    await fireEvent.click(screen.getByRole("button", { name: "Воспроизвести clip.mp4" }));
    await waitFor(() => expect(ready.container.querySelector("video")).not.toBeNull());
    const video = ready.container.querySelector("video");
    expect(video?.hasAttribute("playsinline")).toBe(true);
    expect(video?.getAttribute("src")).toBe("https://objects.example.test/fresh-video");
    expect(refreshUrl).toHaveBeenCalledTimes(1);
  });

  it("does not open a refreshed document URL when retention expires during refresh", async () => {
    const refresh = deferred<string | null>();
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const view = render(ChatFileMessage, {
      props: {
        kind: "document",
        attachment: documentAttachment({ scanStatus: "ready", url: "https://objects.example.test/stale" }),
        refreshUrl: () => refresh.promise
      }
    });

    await fireEvent.click(screen.getByRole("button", { name: "Скачать guide.pdf" }));
    await view.rerender({
      kind: "document",
      attachment: documentAttachment({
        scanStatus: "ready",
        url: "https://objects.example.test/stale",
        expiresAt: "2000-01-01T00:00:00.000Z"
      }),
      refreshUrl: () => refresh.promise
    });
    refresh.resolve("https://objects.example.test/fresh");
    await nextTick();

    expect(open).not.toHaveBeenCalled();
    expect(screen.getByText("Файл удалён по сроку хранения")).toBeTruthy();
  });

  it("clears an activated video when a later scan state rejects it", async () => {
    const view = render(ChatFileMessage, {
      props: {
        kind: "video",
        attachment: videoAttachment(),
        refreshUrl: vi.fn().mockResolvedValue("https://objects.example.test/fresh-video")
      }
    });
    await fireEvent.click(screen.getByRole("button", { name: "Воспроизвести clip.mp4" }));
    await waitFor(() => expect(view.container.querySelector("video")).not.toBeNull());

    await view.rerender({
      kind: "video",
      attachment: videoAttachment({ scanStatus: "rejected", url: null }),
      refreshUrl: vi.fn()
    });

    expect(view.container.querySelector("video")).toBeNull();
    expect(screen.getByText("Файл заблокирован: обнаружена угроза")).toBeTruthy();
  });

  it("reactively hides an attachment when retention expires while the message stays mounted", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T12:00:00.000Z"));
    render(ChatFileMessage, {
      props: { kind: "video", attachment: videoAttachment({ expiresAt: "2026-07-29T12:00:01.000Z" }), refreshUrl: vi.fn() }
    });
    expect(screen.getByRole("button", { name: "Воспроизвести clip.mp4" })).toBeTruthy();
    await vi.advanceTimersByTimeAsync(1001);
    await nextTick();
    expect(screen.getByText("Файл удалён по сроку хранения")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Воспроизвести clip.mp4" })).toBeNull();
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
