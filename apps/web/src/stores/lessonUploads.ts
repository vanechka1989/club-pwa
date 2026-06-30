import { defineStore } from "pinia";
import { computed, ref } from "vue";

export type LessonUploadStatus = "uploading" | "saving" | "done" | "error";

export type LessonUploadTask = {
  id: string;
  title: string;
  status: LessonUploadStatus;
  progress: number;
  detail: string;
};

export const useLessonUploadsStore = defineStore("lessonUploads", () => {
  const items = ref<LessonUploadTask[]>([]);
  const visibleUploads = computed(() => items.value);
  const activeUpload = computed(() => items.value.find((item) => item.status !== "done") ?? items.value[0] ?? null);

  function add(task: LessonUploadTask) {
    items.value = [task, ...items.value.filter((item) => item.id !== task.id)];
  }

  function update(id: string, patch: Partial<LessonUploadTask>) {
    items.value = items.value.map((item) =>
      item.id === id
        ? {
            ...item,
            ...patch,
            progress: patch.progress === undefined ? item.progress : Math.min(100, Math.max(0, Math.round(patch.progress)))
          }
        : item
    );
  }

  function remove(id: string) {
    items.value = items.value.filter((item) => item.id !== id);
  }

  return {
    items,
    visibleUploads,
    activeUpload,
    add,
    update,
    remove
  };
});
