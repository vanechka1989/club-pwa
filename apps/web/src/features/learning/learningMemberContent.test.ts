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
    avatarPositionX: 50,
    avatarPositionY: 50,
    avatarScale: 1,
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
    cleanup();
    vi.clearAllMocks();
    localStorage.clear();

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

  it("renders YouTube links as a player even when the saved lesson kind is photo", async () => {
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
          id: "lesson-youtube",
          categoryId: "module-1",
          kind: "photo",
          title: "YouTube как фото",
          summary: null,
          body: null,
          mediaUrl: "https://www.youtube.com/live/EVHs7jmRdXk",
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
    vi.mocked(getLearningContent).mockResolvedValueOnce({
      item: {
        id: "lesson-youtube",
        categoryId: "module-1",
        kind: "photo",
        title: "YouTube как фото",
        summary: null,
        body: "Описание под видео.",
        mediaUrl: "https://www.youtube.com/live/EVHs7jmRdXk",
        thumbnailUrl: null,
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
    await fireEvent.click(screen.getByRole("button", { name: /YouTube как фото/ }));

    await waitFor(() => expect(document.querySelector(".lesson-youtube-player")).toBeTruthy());
    expect(document.querySelector(".lesson-youtube-player")?.getAttribute("src")).toBe(
      "https://www.youtube.com/embed/EVHs7jmRdXk?rel=0&playsinline=1"
    );
    expect(document.querySelector(".lesson-viewer-media")).toBeNull();
  });

  it("uses an uncropped YouTube thumbnail for lesson cards when a cover is not set", async () => {
    vi.mocked(getLearningHome).mockResolvedValueOnce({
      categories: [
        {
          id: "module-1",
          slug: "module-1",
          title: "Клиентский модуль",
          description: "Материалы для клиента",
          defaultCardLayout: "horizontal",
          isPublished: true,
          itemsCount: 1
        }
      ],
      featured: [
        {
          id: "lesson-youtube",
          categoryId: "module-1",
          kind: "video",
          title: "YouTube урок",
          summary: null,
          body: null,
          mediaUrl: "https://www.youtube.com/live/EVHs7jmRdXk",
          thumbnailUrl: null,
          cardLayout: "horizontal",
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

    renderAsMember();

    await fireEvent.click(await screen.findByRole("button", { name: "Развернуть Клиентский модуль" }));

    const lessonButton = screen.getByRole("button", { name: /YouTube урок/ });

    expect(screen.getByAltText("YouTube урок").getAttribute("src")).toBe("https://img.youtube.com/vi/EVHs7jmRdXk/hqdefault.jpg");
    expect(lessonButton.classList.contains("admin-mockup-thumb-youtube")).toBe(true);
  });

  it("provides an invisible fullscreen fallback over the YouTube native control area", async () => {
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
          id: "lesson-youtube",
          categoryId: "module-1",
          kind: "video",
          title: "YouTube урок",
          summary: null,
          body: null,
          mediaUrl: "https://www.youtube.com/live/EVHs7jmRdXk",
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
    vi.mocked(getLearningContent).mockResolvedValueOnce({
      item: {
        id: "lesson-youtube",
        categoryId: "module-1",
        kind: "video",
        title: "YouTube урок",
        summary: null,
        body: "Описание под видео.",
        mediaUrl: "https://www.youtube.com/live/EVHs7jmRdXk",
        thumbnailUrl: null,
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
    await fireEvent.click(screen.getByRole("button", { name: /YouTube урок/ }));
    const player = await waitFor(() => {
      const element = document.querySelector<HTMLIFrameElement>(".lesson-youtube-player");
      if (!element) {
        throw new Error("YouTube player was not rendered");
      }
      return element;
    });

    expect(player.getAttribute("allow")).toContain("fullscreen");
    expect(player.hasAttribute("allowfullscreen")).toBe(true);
    expect(screen.queryByRole("button", { name: "Развернуть YouTube видео" })).toBeNull();
    expect(document.querySelector(".lesson-youtube-fullscreen-button")).toBeNull();
    expect(screen.queryByRole("button", { name: "Открыть YouTube во весь экран" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Выйти из полноэкранного YouTube видео" })).toBeNull();
    expect(document.querySelector(".lesson-youtube-native-fullscreen-hitbox")).toBeNull();
    expect(document.querySelector(".lesson-youtube-player-shell-fullscreen")).toBeNull();
  });

  it("shows the same close pill in regular video fullscreen", async () => {
    vi.mocked(getLearningHome).mockResolvedValueOnce({
      categories: [
        {
          id: "module-1",
          slug: "module-1",
          title: "Клиентский модуль",
          description: "Материалы для клиента",
          defaultCardLayout: "horizontal",
          isPublished: true,
          itemsCount: 1
        }
      ],
      featured: [
        {
          id: "lesson-video",
          categoryId: "module-1",
          kind: "video",
          title: "Видео урок",
          summary: null,
          body: null,
          mediaUrl: "https://example.com/video.mp4",
          thumbnailUrl: null,
          cardLayout: "horizontal",
          mediaContentType: "video/mp4",
          mediaSizeBytes: 2048,
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
        id: "lesson-video",
        categoryId: "module-1",
        kind: "video",
        title: "Видео урок",
        summary: null,
        body: null,
        mediaUrl: "https://example.com/video.mp4",
        thumbnailUrl: null,
        cardLayout: "horizontal",
        mediaContentType: "video/mp4",
        mediaSizeBytes: 2048,
        publishedAt: "2026-06-29T10:00:00.000Z"
      },
      completedAt: null,
      playbackPositionSeconds: 0
    });

    renderAsMember();

    await fireEvent.click(await screen.findByRole("button", { name: "Развернуть Клиентский модуль" }));
    await fireEvent.click(screen.getByRole("button", { name: /Видео урок/ }));
    await waitFor(() => expect(document.querySelector(".lesson-video-player")).toBeTruthy());
    await fireEvent.click(screen.getByRole("button", { name: "Открыть видео во весь экран" }));

    expect(document.querySelector(".lesson-video-player-fullscreen")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Выйти из полноэкранного видео" }).textContent).toContain("Закрыть");
  });

  it("renders lesson title labels above vertical and horizontal covers", async () => {
    vi.mocked(getLearningHome).mockResolvedValueOnce({
      categories: [
        {
          id: "module-vertical",
          slug: "module-vertical",
          title: "Вертикальный модуль",
          description: "Вертикальные карточки",
          defaultCardLayout: "vertical",
          isPublished: true,
          itemsCount: 1
        },
        {
          id: "module-horizontal",
          slug: "module-horizontal",
          title: "Горизонтальный модуль",
          description: "Горизонтальные карточки",
          defaultCardLayout: "horizontal",
          isPublished: true,
          itemsCount: 1
        }
      ],
      featured: [
        {
          id: "lesson-vertical",
          categoryId: "module-vertical",
          kind: "photo",
          title: "Вертикальный урок",
          summary: null,
          body: null,
          mediaUrl: "https://example.com/vertical.jpg",
          thumbnailUrl: "https://example.com/vertical-cover.jpg",
          cardLayout: "vertical",
          mediaContentType: "image/jpeg",
          mediaSizeBytes: 1024,
          publishedAt: "2026-06-29T10:00:00.000Z"
        },
        {
          id: "lesson-horizontal",
          categoryId: "module-horizontal",
          kind: "video",
          title: "Горизонтальный урок",
          summary: null,
          body: null,
          mediaUrl: "https://example.com/horizontal.mp4",
          thumbnailUrl: "https://example.com/horizontal-cover.jpg",
          cardLayout: "horizontal",
          mediaContentType: "video/mp4",
          mediaSizeBytes: 2048,
          publishedAt: "2026-06-29T10:00:00.000Z"
        }
      ],
      progress: {
        totalItems: 2,
        completedItems: 0,
        lastOpenedItem: null,
        lastOpenedAt: null,
        lastOpenedPlaybackPositionSeconds: 0
      }
    });

    renderAsMember();

    await fireEvent.click(await screen.findByRole("button", { name: "Развернуть Вертикальный модуль" }));
    await fireEvent.click(screen.getByRole("button", { name: "Развернуть Горизонтальный модуль" }));

    const verticalButton = screen.getByRole("button", { name: "Открыть урок Вертикальный урок" });
    const horizontalButton = screen.getByRole("button", { name: "Открыть урок Горизонтальный урок" });
    const verticalLabel = verticalButton.querySelector(".admin-mockup-thumb-label");
    const horizontalLabel = horizontalButton.querySelector(".admin-mockup-thumb-label");
    const verticalImage = verticalButton.querySelector("img");
    const horizontalImage = horizontalButton.querySelector("img");

    expect(verticalLabel).toBeTruthy();
    expect(horizontalLabel).toBeTruthy();
    expect(verticalLabel?.textContent).toContain("Вертикальный урок");
    expect(horizontalLabel?.textContent).toContain("Горизонтальный урок");
    expect(verticalLabel?.compareDocumentPosition(verticalImage as Node) ?? 0).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(horizontalLabel?.compareDocumentPosition(horizontalImage as Node) ?? 0).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("renders lesson and material text below their media content", async () => {
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
        body: "Текст основного урока ниже фото.",
        mediaUrl: "https://example.com/photo.jpg",
        thumbnailUrl: null,
        cardLayout: "vertical",
        mediaContentType: "image/jpeg",
        mediaSizeBytes: 1024,
        materials: [
          {
            id: "material-photo",
            kind: "photo",
            title: "Фото внутри урока",
            description: "Дополнительное фото",
            body: "Описание дополнительного фото ниже изображения.",
            mediaUrl: "https://example.com/material-photo.jpg",
            mediaContentType: "image/jpeg",
            mediaSizeBytes: 2048
          }
        ],
        publishedAt: "2026-06-29T10:00:00.000Z"
      },
      completedAt: null,
      playbackPositionSeconds: 0
    });

    renderAsMember();

    await fireEvent.click(await screen.findByRole("button", { name: "Развернуть Клиентский модуль" }));
    await fireEvent.click(screen.getByRole("button", { name: /Фотоурок/ }));

    await waitFor(() => expect(screen.getByText("Текст основного урока ниже фото.")).toBeTruthy());
    const lessonMedia = document.querySelector('.lesson-viewer-media[src="https://example.com/photo.jpg"]');
    const lessonText = screen.getByText("Текст основного урока ниже фото.");
    const materialMedia = document.querySelector('.lesson-material-block img[src="https://example.com/material-photo.jpg"]');
    const materialText = screen.getByText("Описание дополнительного фото ниже изображения.");

    expect(lessonMedia).toBeTruthy();
    expect(materialMedia).toBeTruthy();
    expect(lessonMedia?.compareDocumentPosition(lessonText) ?? 0).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(materialMedia?.compareDocumentPosition(materialText) ?? 0).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.queryByText("Фото внутри урока")).toBeNull();
    expect(screen.queryByText("Дополнительное фото")).toBeNull();
    expect(document.querySelector(".lesson-material-card")).toBeNull();
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

    const continueCard = await screen.findByRole("button", { name: "Продолжить урок Голосовые практики" });
    expect(screen.getByText("Голосовые практики")).toBeTruthy();
    expect(screen.getAllByText("Видео модуль").length).toBeGreaterThan(0);
    expect(screen.getByText("Продолжить с 4:12")).toBeTruthy();
    expect(continueCard.querySelector(".continue-lesson-copy small")).toBeNull();
    expect(continueCard.querySelector(".continue-lesson-copy .continue-lesson-action")?.textContent).toBe("Продолжить с 4:12");

    await fireEvent.click(continueCard);

    await waitFor(() => expect(getLearningContent).toHaveBeenCalledWith("lesson-video"));
  });

  it("continues the last opened lesson material instead of the lesson main media", async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView
    });
    const audioMaterial = {
      id: "material-audio",
      kind: "audio" as const,
      title: "Аудио дорожка",
      description: "Последний открытый материал",
      body: "",
      mediaUrl: "https://example.com/material-audio.mp3",
      mediaContentType: "audio/mpeg",
      mediaSizeBytes: 2048
    };
    const photoMaterial = {
      id: "material-photo",
      kind: "photo" as const,
      title: "Фото",
      description: "",
      body: "",
      mediaUrl: "https://example.com/material-photo.jpg",
      mediaContentType: "image/jpeg",
      mediaSizeBytes: 1024
    };
    const lesson = {
      id: "lesson-video",
      categoryId: "module-video",
      kind: "video" as const,
      title: "Видео урок",
      summary: "Видео, фото и аудио",
      body: null,
      mediaUrl: "https://example.com/video.mp4",
      thumbnailUrl: "https://example.com/video-cover.jpg",
      cardLayout: "horizontal" as const,
      mediaContentType: "video/mp4",
      mediaSizeBytes: 1024,
      materials: [photoMaterial, audioMaterial],
      publishedAt: "2026-06-29T10:00:00.000Z"
    };

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
        lastOpenedItem: lesson,
        lastOpenedMaterialId: "material-audio",
        lastOpenedAt: "2026-06-29T10:00:00.000Z",
        lastOpenedPlaybackPositionSeconds: 65
      }
    });
    vi.mocked(getLearningContent).mockResolvedValueOnce({
      item: lesson,
      completedAt: null,
      lastOpenedMaterialId: "material-audio",
      playbackPositionSeconds: 65
    });
    vi.mocked(saveLearningPlayback).mockResolvedValueOnce({
      ok: true,
      lastOpenedMaterialId: "material-audio",
      playbackPositionSeconds: 70
    });

    renderAsMember();

    expect(await screen.findByText("Аудио дорожка")).toBeTruthy();
    expect(screen.getByText("Продолжить с 1:05")).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "Продолжить урок Видео урок" }));
    await waitFor(() => expect(document.querySelector('audio[src="https://example.com/material-audio.mp3"]')).toBeTruthy());

    const audio = document.querySelector('audio[src="https://example.com/material-audio.mp3"]') as HTMLAudioElement;
    expect(scrollIntoView).toHaveBeenCalled();
    await fireEvent.loadedMetadata(audio);
    expect(Math.round(audio.currentTime)).toBe(65);

    Object.defineProperty(audio, "currentTime", { configurable: true, value: 70 });
    await fireEvent.pause(audio);

    await waitFor(() => expect(saveLearningPlayback).toHaveBeenCalledWith("lesson-video", 70, { materialId: "material-audio" }));
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

  it("forces playback save when leaving the page", async () => {
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
    vi.mocked(saveLearningPlayback).mockResolvedValueOnce({
      ok: true,
      playbackPositionSeconds: 263
    });

    renderAsMember();
    await fireEvent.click(await screen.findByRole("button", { name: "Продолжить урок Голосовые практики" }));
    await waitFor(() => expect(document.querySelector("video")).toBeTruthy());

    const video = document.querySelector("video") as HTMLVideoElement;
    Object.defineProperty(video, "currentTime", { configurable: true, value: 263 });
    window.dispatchEvent(new Event("pagehide"));

    await waitFor(() => expect(saveLearningPlayback).toHaveBeenCalledWith("lesson-video", 263, { keepalive: true }));
  });

  it("does not mark playback as saved when the API save fails", async () => {
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
    vi.mocked(saveLearningPlayback)
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({
        ok: true,
        playbackPositionSeconds: 263
      });

    renderAsMember();
    await fireEvent.click(await screen.findByRole("button", { name: "Продолжить урок Голосовые практики" }));
    await waitFor(() => expect(document.querySelector("video")).toBeTruthy());

    const video = document.querySelector("video") as HTMLVideoElement;
    Object.defineProperty(video, "currentTime", { configurable: true, value: 263 });
    await fireEvent.pause(video);
    await fireEvent.pause(video);

    await waitFor(() => expect(saveLearningPlayback).toHaveBeenCalledTimes(2));
    expect(saveLearningPlayback).toHaveBeenLastCalledWith("lesson-video", 263, undefined);
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
