import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/vue";
import { createPinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getLearningContent, getLearningHome } from "@/api/client";
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
});
