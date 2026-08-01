import { ref, watch, type Ref } from "vue";
import type { LearningFavoriteMutationResponse } from "@club/shared";
import { setLearningFavorite } from "@/api/client";

type SaveFavorite = (id: string, favorite: boolean) => Promise<LearningFavoriteMutationResponse>;

export function useLearningFavorites(initialIds: Ref<readonly string[]>, save: SaveFavorite = setLearningFavorite) {
  const favoriteIds = ref(new Set(initialIds.value));
  const pendingIds = ref(new Set<string>());

  watch(initialIds, (ids) => {
    favoriteIds.value = new Set(ids);
  });

  function isFavorite(id: string) {
    return favoriteIds.value.has(id);
  }

  function isPending(id: string) {
    return pendingIds.value.has(id);
  }

  async function toggleFavorite(id: string) {
    if (isPending(id)) return;
    const wasFavorite = isFavorite(id);
    const nextFavorite = !wasFavorite;
    favoriteIds.value = new Set(favoriteIds.value);
    nextFavorite ? favoriteIds.value.add(id) : favoriteIds.value.delete(id);
    pendingIds.value = new Set(pendingIds.value).add(id);
    try {
      await save(id, nextFavorite);
    } catch (error) {
      favoriteIds.value = new Set(favoriteIds.value);
      wasFavorite ? favoriteIds.value.add(id) : favoriteIds.value.delete(id);
      throw error;
    } finally {
      pendingIds.value = new Set(pendingIds.value);
      pendingIds.value.delete(id);
    }
  }

  return { favoriteIds, pendingIds, isFavorite, isPending, toggleFavorite };
}
