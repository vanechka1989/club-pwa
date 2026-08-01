import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { useLearningFavorites } from "./useLearningFavorites";

describe("useLearningFavorites", () => {
  it("adds and removes favorites optimistically", async () => {
    const save = vi.fn().mockResolvedValue({ ok: true, favorite: true });
    const favorites = useLearningFavorites(ref(["lesson-a"]), save);

    const adding = favorites.toggleFavorite("lesson-b");
    expect(favorites.isFavorite("lesson-b")).toBe(true);
    await adding;

    save.mockResolvedValueOnce({ ok: true, favorite: false });
    const removing = favorites.toggleFavorite("lesson-a");
    expect(favorites.isFavorite("lesson-a")).toBe(false);
    await removing;
    expect(save).toHaveBeenNthCalledWith(1, "lesson-b", true);
    expect(save).toHaveBeenNthCalledWith(2, "lesson-a", false);
  });

  it("rolls back on failure and ignores a repeated pending tap", async () => {
    let rejectSave!: (reason: Error) => void;
    const save = vi.fn(() => new Promise<{ ok: boolean; favorite: boolean }>((_, reject) => { rejectSave = reject; }));
    const favorites = useLearningFavorites(ref<string[]>([]), save);

    const first = favorites.toggleFavorite("lesson-a");
    const second = favorites.toggleFavorite("lesson-a");
    expect(save).toHaveBeenCalledTimes(1);
    expect(favorites.isFavorite("lesson-a")).toBe(true);

    rejectSave(new Error("offline"));
    await expect(first).rejects.toThrow("offline");
    await expect(second).resolves.toBeUndefined();
    expect(favorites.isFavorite("lesson-a")).toBe(false);
    expect(favorites.isPending("lesson-a")).toBe(false);
  });
});
