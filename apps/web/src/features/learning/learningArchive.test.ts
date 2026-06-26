import { cleanup, render, screen, within } from "@testing-library/vue";
import type { AdminLearningResponse, LearningHomeResponse, MeResponse } from "@club/shared";
import { createPinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LearningSection from "./LearningSection.vue";
import { useSessionStore } from "@/stores/session";

const learningHome: LearningHomeResponse = {
  categories: [],
  featured: [],
  progress: {
    totalItems: 0,
    completedItems: 0,
    lastOpenedItem: null,
    lastOpenedAt: null
  }
};

const adminLearning: AdminLearningResponse = {
  categories: [],
  materials: [
    {
      id: "archived-audio",
      categoryId: "audio",
      kind: "audio",
      title: "Голосовое тест",
      summary: null,
      body: null,
      mediaUrl: "https://example.com/audio.webm",
      thumbnailUrl: null,
      mediaContentType: "audio/webm",
      mediaSizeBytes: 1024,
      publishedAt: "2026-06-26T00:00:00.000Z",
      isPublished: false,
      archivedUntil: "2026-07-03T00:00:00.000Z",
      createdAt: "2026-06-26T00:00:00.000Z",
      updatedAt: "2026-06-26T00:00:00.000Z"
    },
    {
      id: "archived-photo",
      categoryId: "photo",
      kind: "photo",
      title: "Котик",
      summary: null,
      body: null,
      mediaUrl: "https://example.com/photo.jpg",
      thumbnailUrl: null,
      mediaContentType: "image/jpeg",
      mediaSizeBytes: 2048,
      publishedAt: "2026-06-26T00:00:00.000Z",
      isPublished: false,
      archivedUntil: "2026-07-03T00:00:00.000Z",
      createdAt: "2026-06-26T00:00:00.000Z",
      updatedAt: "2026-06-26T00:00:00.000Z"
    }
  ]
};

vi.mock("@/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/client")>();

  return {
    ...actual,
    getLearningHome: vi.fn(async () => learningHome),
    getAdminLearning: vi.fn(async () => adminLearning),
    getMe: vi.fn(
      async (): Promise<MeResponse> => ({
        user: {
          id: "owner",
          telegramId: "593677751",
          firstName: "Ivan",
          username: null,
          photoUrl: null,
          role: "owner",
          realRole: "owner",
          membershipStatus: "active",
          membershipExpiresAt: null,
          paymentType: "manual",
          recurrentPaymentStatus: null,
          nextPaymentAt: null,
          avatarRefreshedAt: null
        }
      })
    )
  };
});

describe("Learning archived content", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("marks archived content as deleted", async () => {
    const pinia = createPinia();
    const session = useSessionStore(pinia);
    session.user = {
      id: "owner",
      telegramId: "593677751",
      firstName: "Ivan",
      username: null,
      photoUrl: null,
      role: "owner",
      realRole: "owner",
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

    expect(await screen.findAllByText("Удалено")).toHaveLength(2);
    expect(screen.getByText("Голосовое тест")).toBeTruthy();
    expect(screen.getByText("Котик")).toBeTruthy();
    expect(
      within(screen.getByRole("article", { name: "Удалённый контент: Голосовое тест" })).getByRole("button", {
        name: "Восстановить"
      })
    ).toBeTruthy();
    expect(
      within(screen.getByRole("article", { name: "Удалённый контент: Котик" })).getByRole("button", {
        name: "Восстановить"
      })
    ).toBeTruthy();
  });
});
