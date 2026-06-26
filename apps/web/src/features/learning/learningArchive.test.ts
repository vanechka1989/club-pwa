import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/vue";
import { createPinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSessionStore } from "@/stores/session";
import LearningSection from "./LearningSection.vue";

const apiMock = vi.hoisted(() => ({
  getAdminLearning: vi.fn(),
  getLearningHome: vi.fn(),
  createAdminLearningCategory: vi.fn(),
  updateAdminLearningCategory: vi.fn(),
  createAdminLearningMaterial: vi.fn(),
  updateAdminLearningMaterial: vi.fn(),
  getLearningContent: vi.fn(),
  completeLearningContent: vi.fn(),
  saveLearningPlayback: vi.fn()
}));

vi.mock("@/api/client", () => apiMock);

const baseCategories = [
  {
    id: "module-1",
    slug: "module-1",
    title: "Модуль 1",
    description: "Первый модуль клуба",
    isPublished: true,
    itemsCount: 2
  },
  {
    id: "module-2",
    slug: "module-2",
    title: "Модуль 2",
    description: "Второй модуль клуба",
    isPublished: true,
    itemsCount: 1
  }
];

const baseMaterials = [
  {
    id: "lesson-1",
    categoryId: "module-1",
    kind: "photo",
    title: "Урок с фото",
    summary: "Короткое описание",
    body: null,
    mediaUrl: "https://example.com/photo.jpg",
    thumbnailUrl: null,
    mediaContentType: "image/jpeg",
    mediaSizeBytes: 100,
    publishedAt: "2026-06-26T00:00:00.000Z",
    isPublished: true,
    archivedUntil: null,
    createdAt: "2026-06-26T00:00:00.000Z",
    updatedAt: "2026-06-26T00:00:00.000Z"
  },
  {
    id: "lesson-2",
    categoryId: "module-1",
    kind: "audio",
    title: "Голосовой урок",
    summary: null,
    body: null,
    mediaUrl: "https://example.com/voice.webm",
    thumbnailUrl: null,
    mediaContentType: "audio/webm",
    mediaSizeBytes: 100,
    publishedAt: "2026-06-26T00:00:00.000Z",
    isPublished: true,
    archivedUntil: null,
    createdAt: "2026-06-26T00:00:00.000Z",
    updatedAt: "2026-06-26T00:00:00.000Z"
  },
  {
    id: "lesson-3",
    categoryId: "module-2",
    kind: "video",
    title: "Видео урок",
    summary: null,
    body: null,
    mediaUrl: "https://example.com/video.mp4",
    thumbnailUrl: "https://example.com/cover.jpg",
    mediaContentType: "video/mp4",
    mediaSizeBytes: 100,
    publishedAt: "2026-06-26T00:00:00.000Z",
    isPublished: true,
    archivedUntil: null,
    createdAt: "2026-06-26T00:00:00.000Z",
    updatedAt: "2026-06-26T00:00:00.000Z"
  }
];

function mockAdminLearning() {
  apiMock.getAdminLearning.mockResolvedValue({
    categories: baseCategories,
    materials: baseMaterials
  });
}

function renderAsOwner() {
  const pinia = createPinia();
  const session = useSessionStore(pinia);
  session.user = {
    id: "owner-id",
    telegramId: "593677751",
    firstName: "Ivan",
    username: null,
    photoUrl: null,
    role: "owner",
    realRole: "owner",
    membershipStatus: "active",
    membershipExpiresAt: null,
    paymentType: "none",
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

describe("Learning section modules", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mockAdminLearning();
  });

  it("shows modules and lessons in the mockups style", async () => {
    renderAsOwner();

    expect(await screen.findByRole("heading", { name: "Модули" })).toBeTruthy();
    expect(await screen.findByText("Модуль 1")).toBeTruthy();
    expect(screen.getByText("Модуль 2")).toBeTruthy();
    expect(screen.getByText("2 урока")).toBeTruthy();
    expect(screen.getByText("1 урок")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Редактировать урок Урок с фото" })).toBeTruthy();
    expect(screen.queryByText("Контент")).toBeNull();
  });

  it("adds a module by title", async () => {
    apiMock.createAdminLearningCategory.mockResolvedValue({
      ok: true,
      category: {
        id: "module-3",
        slug: "module-3",
        title: "Модуль 3",
        description: "Модуль клуба",
        isPublished: true,
        itemsCount: 0
      }
    });
    renderAsOwner();

    await screen.findByText("Модуль 1");
    await fireEvent.click(screen.getByRole("button", { name: "Добавить модуль" }));

    expect(screen.getByRole("dialog", { name: "Новый модуль" }).classList.contains("module-name-modal")).toBe(true);
    expect(screen.getByRole("dialog", { name: "Новый модуль" }).classList.contains("admin-client-modal")).toBe(false);
    expect(screen.getByLabelText("Название модуля").classList.contains("text-input")).toBe(true);

    await fireEvent.update(screen.getByLabelText("Название модуля"), "Модуль 3");
    await fireEvent.click(screen.getByRole("button", { name: "Сохранить модуль" }));

    await waitFor(() => expect(screen.getByText("Модуль 3")).toBeTruthy());
    expect(apiMock.createAdminLearningCategory).toHaveBeenCalledWith({
      title: "Модуль 3",
      description: "Модуль клуба. Внутри будут уроки и материалы."
    });
    expect(screen.queryByRole("dialog", { name: "Новый модуль" })).toBeNull();
  });

  it("renames a selected module", async () => {
    apiMock.updateAdminLearningCategory.mockResolvedValue({
      ok: true,
      category: {
        ...baseCategories[0],
        title: "Первый модуль"
      }
    });
    renderAsOwner();

    await screen.findByText("Модуль 1");
    await fireEvent.click(screen.getByRole("button", { name: "Редактировать модуль" }));

    expect(screen.getByText("Выберите модуль для редактирования.")).toBeTruthy();

    await fireEvent.click(screen.getByRole("button", { name: "Редактировать Модуль 1" }));
    await fireEvent.update(screen.getByLabelText("Название модуля"), "Первый модуль");
    await fireEvent.click(screen.getByRole("button", { name: "Сохранить модуль" }));

    await waitFor(() => expect(screen.getByText("Первый модуль")).toBeTruthy());
    expect(screen.queryByRole("dialog", { name: "Редактировать модуль" })).toBeNull();
  });

  it("opens an existing lesson for editing by clicking its card", async () => {
    renderAsOwner();

    await screen.findByText("Урок с фото");
    await fireEvent.click(screen.getByRole("button", { name: "Редактировать урок Урок с фото" }));

    expect(screen.getByRole("dialog", { name: "Редактировать урок" })).toBeTruthy();
    expect(screen.getByDisplayValue("Урок с фото")).toBeTruthy();
  });
});
