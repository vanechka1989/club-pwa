import { computed, onScopeDispose, ref } from "vue";

export function useImageDraft() {
  const files = ref<File[]>([]);
  const previews = ref<string[]>([]);
  const error = ref<string | null>(null);
  const hasImages = computed(() => files.value.length > 0);

  function resetUrls() { previews.value.forEach((url) => URL.revokeObjectURL(url)); }
  function add(selected: File[]) {
    error.value = null;
    const valid = selected.filter((file) => {
      if (!file.type.startsWith("image/")) { error.value = "Можно выбрать только изображения."; return false; }
      if (file.size > 15 * 1024 * 1024) { error.value = "Размер изображения не должен превышать 15 МБ."; return false; }
      return true;
    });
    const next = [...files.value, ...valid].slice(0, 10);
    if (files.value.length + valid.length > 10) error.value = "Можно отправить не больше 10 изображений.";
    resetUrls();
    files.value = next;
    previews.value = next.map((file) => URL.createObjectURL(file));
  }
  function remove(index: number) { add(files.value.filter((_, itemIndex) => itemIndex !== index)); }
  function clear() { resetUrls(); files.value = []; previews.value = []; error.value = null; }
  onScopeDispose(clear);
  return { files, previews, error, hasImages, add, remove, clear };
}
