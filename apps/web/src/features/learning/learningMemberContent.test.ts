import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/vue";
import { createPinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getLearningContent, getLearningHome, saveLearningPlayback } from "@/api/client";
import { useSessionStore } from "@/stores/session";
import LearningSection from "./LearningSection.vue";

vi.mock("@/api/client", () => ({
  createAdminLearningCategory: vi.fn(),
  createAdminLearningMaterial: vi.fn(),
  deleteAdminLearningCategory: vi.fn(),
  deleteAdminLearningMaterial: vi.fn(),
  getAdminLearning: vi.fn(),
  getLearningContent: vi.fn(),
  getLearningHome: vi.fn(),
  restoreAdminLearningMaterial: vi.fn(),
  saveLearningPlayback: vi.fn(),
  updateAdminLearningCategory: vi.fn(),
  updateAdminLearningMaterial: vi.fn()
}));

function renderAsMember() {
  const pinia = createPinia();
  const session = useSessionStore(pinia);
  session.user = {
    id: "member-id",
    telegramId: "753327296",
    firstName: "Екатерина",
    username: null,
    photoUrl: null,
    role: "member",
    realRole: "member",
    adminRoleLabel: null,
    adminPermissions: [],
    membershipStatus: "active",
    membershipExpiresAt: null,
    paymentType: "manual",
    recurrentPaymentStatus: null,
    nextPaymentAt: null,
    avatarRefreshedAt: null
  };

  render(LearningSection, {
    global: {
      plugins: [pinia]
    }
  });
}

describe("Learning section member content", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    cleanup();

    vi.mocked(getLearningHome).mockResolvedValue({
      categories: [
        {
          id: "module-1",
          slug: "module-1",
          title: "Клиентский модуль",
          description: "Материалы для клиента",
          defaultCardLayout: "vertical",
          isPublished: true,
          itemsCount: 1
        }
      ],
      featured: [
        {
          id: "lesson-1",
          categoryId: "module-1",
          kind: "text",
          title: "Урок с содержимым",
          summary: "Короткое описание",
          body: null,
          mediaUrl: null,
          thumbnailUrl: null,
          cardLayout: "vertical",
          mediaContentType: null,
          mediaSizeBytes: null,
          publishedAt: "2026-06-29T10:00:00.000Z"
        }
      ],
      progress: {
        totalItems: 1,
        completedItems: 0,
        lastOpenedItem: null,
        lastOpenedAt: null,
        lastOpenedPlaybackPositionSeconds: 0
      }
    });

    vi.mocked(getLearningContent).mockResolvedValue({
      item: {
        id: "lesson-1",
        categoryId: "module-1",
        kind: "text",
        title: "Урок с содержимым",
        summary: "Короткое описание",
        body: "Полный текст урока для клиента.",
        mediaUrl: null,
        thumbnailUrl: null,
        cardLayout: "vertical",
        mediaContentType: null,
        mediaSizeBytes: null,
        publishedAt: "2026-06-29T10:00:00.000Z"
      },
      completedAt: null,
      playbackPositionSeconds: 0
    });
    vi.mocked(saveLearningPlayback).mockResolvedValue({
      ok: true,
      playbackPositionSeconds: 252
    });
  });

  it("loads full lesson content when a member opens a lesson card", async () => {
    renderAsMember();

    await fireEvent.click(await screen.findByRole("button", { name: "Развернуть Клиентский модуль" }));
    await fireEvent.click(screen.getByRole("button", { name: /Урок с содержимым/ }));

    await waitFor(() => expect(getLearningContent).toHaveBeenCalledWith("lesson-1"));
    expect(screen.getByText("Полный текст урока для клиента.")).toBeTruthy();
    expect(screen.queryByText("Содержимое урока пока не добавлено.")).toBeNull();
  });

  it("does not show an empty content message for media-only lessons", async () => {
    vi.mocked(getLearningHome).mockResolvedValueOnce({
      categories: [
        {
          id: "module-1",
          slug: "module-1",
          title: "Клиентский модуль",
          description: "Материалы для клиента",
          defaultCardLayout: "vertical",
          isPublished: true,
          itemsCount: 1
        }
      ],
      featured: [
        {
          id: "lesson-photo",
          categoryId: "module-1",
          kind: "photo",
          title: "Фотоурок",
          summary: null,
          body: null,
          mediaUrl: "https://example.com/photo.jpg",
          thumbnailUrl: null,
          cardLayout: "vertical",
          mediaContentType: "image/jpeg",
          mediaSizeBytes: 1024,
          publishedAt: "2026-06-29T10:00:00.000Z"
        }
      ],
      progress: {
        totalItems: 1,
        completedItems: 0,
        lastOpenedItem: null,
        lastOpenedAt: null,
        lastOpenedPlaybackPositionSeconds: 0
      }
    });
    vi.mocked(getLearningContent).mockResolvedValueOnce({
      item: {
        id: "lesson-photo",
        categoryId: "module-1",
        kind: "photo",
        title: "Фотоурок",
        summary: null,
        body: null,
        mediaUrl: "https://example.com/photo.jpg",
        thumbnailUrl: null,
        cardLayout: "vertical",
        mediaContentType: "image/jpeg",
        mediaSizeBytes: 1024,
        publishedAt: "2026-06-29T10:00:00.000Z"
      },
      completedAt: null,
      playbackPositionSeconds: 0
    });
    renderAsMember();

    await fireEvent.click(await screen.findByRole("button", { name: "Развернуть Клиентский модуль" }));
    await fireEvent.click(screen.getByRole("button", { name: /Фотоурок/ }));

    expect(document.querySelector(".lesson-viewer-media")?.getAttribute("src")).toBe("https://example.com/photo.jpg");
    expect(screen.queryByText("Содержимое урока пока не добавлено.")).toBeNull();
  });

  it("opens member lessons directly on material instead of showing the cover inside the dialog", async () => {
    vi.mocked(getLearningHome).mockResolvedValueOnce({
      categories: [
        {
          id: "module-1",
          slug: "module-1",
          title: "Клиентский модуль",
          description: "Материалы для клиента",
          defaultCardLayout: "vertical",
          isPublished: true,
          itemsCount: 1
        }
      ],
      featured: [
        {
          id: "lesson-cover",
          categoryId: "module-1",
          kind: "text",
          title: "Урок с обложкой",
          summary: "Короткое описание",
          body: null,
          mediaUrl: null,
          thumbnailUrl: "https://example.com/cover.jpg",
          cardLayout: "vertical",
          mediaContentType: null,
          mediaSizeBytes: null,
          publishedAt: "2026-06-29T10:00:00.000Z"
        }
      ],
      progress: {
        totalItems: 1,
        completedItems: 0,
        lastOpenedItem: null,
        lastOpenedAt: null,
        lastOpenedPlaybackPositionSeconds: 0
      }
    });
    vi.mocked(getLearningContent).mockResolvedValueOnce({
      item: {
        id: "lesson-cover",
        categoryId: "module-1",
        kind: "text",
        title: "Урок с обложкой",
        summary: "Короткое описание",
        body: "Материал открывается сразу.",
        mediaUrl: null,
        thumbnailUrl: "https://example.com/cover.jpg",
        cardLayout: "vertical",
        mediaContentType: null,
        mediaSizeBytes: null,
        publishedAt: "2026-06-29T10:00:00.000Z"
      },
      completedAt: null,
      playbackPositionSeconds: 0
    });
    renderAsMember();

    await fireEvent.click(await screen.findByRole("button", { name: "Развернуть Клиентский модуль" }));
    await fireEvent.click(screen.getByRole("button", { name: /Урок с обложкой/ }));

    await waitFor(() => expect(screen.getByText("Материал открывается сразу.")).toBeTruthy());
    const dialog = screen.getByRole("dialog", { name: "Урок с обложкой" });

    expect(dialog.querySelector(".lesson-viewer-content")).toBeTruthy();
    expect(dialog.querySelector(".lesson-preview-body")).toBeNull();
    expect(dialog.querySelector('img[src="https://example.com/cover.jpg"]')).toBeNull();
  });

  it("shows a continue card for the last opened lesson", async () => {
    vi.mocked(getLearningHome).mockResolvedValueOnce({
      categories: [
        {
          id: "module-video",
          slug: "module-video",
          title: "Видео модуль",
          description: "Материалы с видео",
          defaultCardLayout: "horizontal",
          isPublished: true,
          itemsCount: 1
        }
      ],
      featured: [
        {
          id: "lesson-video",
          categoryId: "module-video",
          kind: "video",
          title: "Голосовые практики",
          summary: "Видео на 12 минут",
          body: null,
          mediaUrl: "https://example.com/video.mp4",
          thumbnailUrl: "https://example.com/video-cover.jpg",
          cardLayout: "horizontal",
          mediaContentType: "video/mp4",
          mediaSizeBytes: 1024,
          publishedAt: "2026-06-29T10:00:00.000Z"
        }
      ],
      progress: {
        totalItems: 1,
        completedItems: 0,
        lastOpenedItem: {
          id: "lesson-video",
          categoryId: "module-video",
          kind: "video",
          title: "Голосовые практики",
          summary: "Видео на 12 минут",
          body: null,
          mediaUrl: "https://example.com/video.mp4",
          thumbnailUrl: "https://example.com/video-cover.jpg",
          cardLayout: "horizontal",
          mediaContentType: "video/mp4",
          mediaSizeBytes: 1024,
          publishedAt: "2026-06-29T10:00:00.000Z"
        },
        lastOpenedAt: "2026-06-29T10:00:00.000Z",
        lastOpenedPlaybackPositionSeconds: 252
      }
    });
    vi.mocked(getLearningContent).mockResolvedValueOnce({
      item: {
        id: "lesson-video",
        categoryId: "module-video",
        kind: "video",
        title: "Голосовые практики",
        summary: "Видео на 12 минут",
        body: null,
        mediaUrl: "https://example.com/video.mp4",
        thumbnailUrl: "https://example.com/video-cover.jpg",
        cardLayout: "horizontal",
        mediaContentType: "video/mp4",
        mediaSizeBytes: 1024,
        publishedAt: "2026-06-29T10:00:00.000Z"
      },
      completedAt: null,
      playbackPositionSeconds: 252
    });

    renderAsMember();

    expect(await screen.findByText("Продолжить урок")).toBeTruthy();
    expect(screen.getByText("Голосовые практики")).toBeTruthy();
    expect(screen.getAllByText("Видео модуль").length).toBeGreaterThan(0);
    expect(screen.getByText("Продолжить с 4:12")).toBeTruthy();

    await fireEvent.click(screen.getByRole("button", { name: "Продолжить урок Голосовые практики" }));

    await waitFor(() => expect(getLearningContent).toHaveBeenCalledWith("lesson-video"));
  });

  it("starts a continued video from the saved playback position", async () => {
    vi.mocked(getLearningHome).mockResolvedValueOnce({
      categories: [
        {
          id: "module-video",
          slug: "module-video",
          title: "Видео модуль",
          description: "Материалы с видео",
          defaultCardLayout: "horizontal",
          isPublished: true,
          itemsCount: 1
        }
      ],
      featured: [],
      progress: {
        totalItems: 1,
        completedItems: 0,
        lastOpenedItem: {
          id: "lesson-video",
          categoryId: "module-video",
          kind: "video",
          title: "Голосовые практики",
          summary: "Видео на 12 минут",
          body: null,
          mediaUrl: "https://example.com/video.mp4",
          thumbnailUrl: null,
          cardLayout: "horizontal",
          mediaContentType: "video/mp4",
          mediaSizeBytes: 1024,
          publishedAt: "2026-06-29T10:00:00.000Z"
        },
        lastOpenedAt: "2026-06-29T10:00:00.000Z",
        lastOpenedPlaybackPositionSeconds: 252
      }
    });
    vi.mocked(getLearningContent).mockResolvedValueOnce({
      item: {
        id: "lesson-video",
        categoryId: "module-video",
        kind: "video",
        title: "Голосовые практики",
        summary: "Видео на 12 минут",
        body: null,
        mediaUrl: "https://example.com/video.mp4",
        thumbnailUrl: null,
        cardLayout: "horizontal",
        mediaContentType: "video/mp4",
        mediaSizeBytes: 1024,
        publishedAt: "2026-06-29T10:00:00.000Z"
      },
      completedAt: null,
      playbackPositionSeconds: 252
    });

    renderAsMember();
    await fireEvent.click(await screen.findByRole("button", { name: "Продолжить урок Голосовые практики" }));
    await waitFor(() => expect(document.querySelector("video")).toBeTruthy());

    const video = document.querySelector("video") as HTMLVideoElement;
    await fireEvent.loadedMetadata(video);

    expect(Math.round(video.currentTime)).toBe(252);
  });

  it("does not overwrite saved playback before the continued video seeks", async () => {
    vi.mocked(getLearningHome).mockResolvedValueOnce({
      categories: [
        {
          id: "module-video",
          slug: "module-video",
          title: "Видео модуль",
          description: "Материалы с видео",
          defaultCardLayout: "horizontal",
          isPublished: true,
          itemsCount: 1
        }
      ],
      featured: [],
      progress: {
        totalItems: 1,
        completedItems: 0,
        lastOpenedItem: {
          id: "lesson-video",
          categoryId: "module-video",
          kind: "video",
          title: "Голосовые практики",
          summary: "Видео на 12 минут",
          body: null,
          mediaUrl: "https://example.com/video.mp4",
          thumbnailUrl: null,
          cardLayout: "horizontal",
          mediaContentType: "video/mp4",
          mediaSizeBytes: 1024,
          publishedAt: "2026-06-29T10:00:00.000Z"
        },
        lastOpenedAt: "2026-06-29T10:00:00.000Z",
        lastOpenedPlaybackPositionSeconds: 252
      }
    });
    vi.mocked(getLearningContent).mockResolvedValueOnce({
      item: {
        id: "lesson-video",
        categoryId: "module-video",
        kind: "video",
        title: "Голосовые практики",
        summary: "Видео на 12 минут",
        body: null,
        mediaUrl: "https://example.com/video.mp4",
        thumbnailUrl: null,
        cardLayout: "horizontal",
        mediaContentType: "video/mp4",
        mediaSizeBytes: 1024,
        publishedAt: "2026-06-29T10:00:00.000Z"
      },
      completedAt: null,
      playbackPositionSeconds: 252
    });

    renderAsMember();
    await fireEvent.click(await screen.findByRole("button", { name: "Продолжить урок Голосовые практики" }));
    await waitFor(() => expect(document.querySelector("video")).toBeTruthy());

    const video = document.querySelector("video") as HTMLVideoElement;
    await fireEvent.timeUpdate(video);

    expect(saveLearningPlayback).not.toHaveBeenCalledWith("lesson-video", 0);
  });

  it("continues audio lessons from the saved playback position", async () => {
    vi.mocked(getLearningHome).mockResolvedValueOnce({
      categories: [
        {
          id: "module-audio",
          slug: "module-audio",
          title: "Аудио модуль",
          description: "Материалы с аудио",
          defaultCardLayout: "vertical",
          isPublished: true,
          itemsCount: 1
        }
      ],
      featured: [],
      progress: {
        totalItems: 1,
        completedItems: 0,
        lastOpenedItem: {
          id: "lesson-audio",
          categoryId: "module-audio",
          kind: "audio",
          title: "Голосовая практика",
          summary: "Аудио урок",
          body: null,
          mediaUrl: "https://example.com/audio.mp3",
          thumbnailUrl: null,
          cardLayout: "vertical",
          mediaContentType: "audio/mpeg",
          mediaSizeBytes: 1024,
          publishedAt: "2026-06-29T10:00:00.000Z"
        },
        lastOpenedAt: "2026-06-29T10:00:00.000Z",
        lastOpenedPlaybackPositionSeconds: 65
      }
    });
    vi.mocked(getLearningContent).mockResolvedValueOnce({
      item: {
        id: "lesson-audio",
        categoryId: "module-audio",
        kind: "audio",
        title: "Голосовая практика",
        summary: "Аудио урок",
        body: null,
        mediaUrl: "https://example.com/audio.mp3",
        thumbnailUrl: null,
        cardLayout: "vertical",
        mediaContentType: "audio/mpeg",
        mediaSizeBytes: 1024,
        publishedAt: "2026-06-29T10:00:00.000Z"
      },
      completedAt: null,
      playbackPositionSeconds: 65
    });

    renderAsMember();

    expect(await screen.findByText("Продолжить с 1:05")).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "Продолжить урок Голосовая практика" }));
    await waitFor(() => expect(document.querySelector("audio")).toBeTruthy());

    const audio = document.querySelector("audio") as HTMLAudioElement;
    await fireEvent.timeUpdate(audio);
    expect(saveLearningPlayback).not.toHaveBeenCalledWith("lesson-audio", 0);

    await fireEvent.loadedMetadata(audio);
    expect(Math.round(audio.currentTime)).toBe(65);
  });
});
