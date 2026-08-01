import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLessonComment, getLessonComments } from "@/api/client";
import LearningLessonNotes from "./LearningLessonNotes.vue";

vi.mock("@/api/client", () => ({ getLessonComments: vi.fn(), createLessonComment: vi.fn() }));
afterEach(cleanup);

const author = {
  id: "member-1", telegramId: "member-1", firstName: "Иван", username: null,
  displayName: "Иван", photoUrl: null, avatarPositionX: 50, avatarPositionY: 50, avatarScale: 1
};
const note = {
  id: "note-1", contentItemId: "lesson-1", body: "Первая мысль", status: "visible" as const,
  author, createdAt: "2026-08-01T09:00:00.000Z"
};

describe("LearningLessonNotes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLessonComments).mockResolvedValue({ comments: [note], mutedUntil: null, mutedPermanently: false });
    vi.mocked(createLessonComment).mockResolvedValue({ ok: true, comment: { ...note, id: "note-2", body: "Важная мысль" } });
  });

  it("loads lazily and saves a trimmed note", async () => {
    render(LearningLessonNotes, { props: { lessonId: "lesson-1" } });
    expect(getLessonComments).not.toHaveBeenCalled();

    await fireEvent.click(screen.getByRole("button", { name: "Открыть мои заметки" }));
    expect(await screen.findByText("Первая мысль")).toBeTruthy();
    await fireEvent.update(screen.getByRole("textbox", { name: "Новая заметка" }), "  Важная мысль  ");
    await fireEvent.click(screen.getByRole("button", { name: "Сохранить заметку" }));

    await waitFor(() => expect(createLessonComment).toHaveBeenCalledWith("lesson-1", "Важная мысль"));
    expect(screen.getByText("Важная мысль")).toBeTruthy();
  });

  it("shows an honest empty state and enforces the length limit", async () => {
    vi.mocked(getLessonComments).mockResolvedValueOnce({ comments: [], mutedUntil: null, mutedPermanently: false });
    render(LearningLessonNotes, { props: { lessonId: "lesson-1" } });
    await fireEvent.click(screen.getByRole("button", { name: "Открыть мои заметки" }));
    expect(await screen.findByText("Заметок пока нет.")).toBeTruthy();
    const input = screen.getByRole("textbox", { name: "Новая заметка" });
    expect(input.getAttribute("maxlength")).toBe("2000");
    expect(screen.getByText(/Заметки видны вам и администраторам/)).toBeTruthy();
  });

  it("retries after a loading error", async () => {
    vi.mocked(getLessonComments).mockRejectedValueOnce(new Error("offline"));
    render(LearningLessonNotes, { props: { lessonId: "lesson-1" } });
    await fireEvent.click(screen.getByRole("button", { name: "Открыть мои заметки" }));
    expect(await screen.findByText("Не удалось загрузить заметки.")).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "Повторить загрузку заметок" }));
    expect(await screen.findByText("Первая мысль")).toBeTruthy();
    expect(getLessonComments).toHaveBeenCalledTimes(2);
  });
});
