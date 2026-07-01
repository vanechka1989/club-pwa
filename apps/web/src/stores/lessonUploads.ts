import { defineStore } from "pinia";
import { computed, ref } from "vue";

export type LessonUploadStatus = "uploading" | "saving" | "done" | "error";

export type LessonUploadTask = {
  id: string;
  title: string;
  status: LessonUploadStatus;
  progress: number;
  detail: string;
  loadedBytes: number;
  totalBytes: number;
  speedBytesPerSecond: number;
  startedAt: number;
  abortController?: AbortController;
};

export const useLessonUploadsStore = defineStore("lessonUploads", () => {
  const items = ref<LessonUploadTask[]>([]);
  const visibleUploads = computed(() => items.value);
  const activeUpload = computed(() => items.value.find((item) => item.status !== "done") ?? items.value[0] ?? null);

  function add(task: LessonUploadTask) {
    items.value = [normalizeTask(task), ...items.value.filter((item) => item.id !== task.id)];
  }

  function update(id: string, patch: Partial<LessonUploadTask>) {
    items.value = items.value.map((item) =>
      item.id === id ? normalizeTask({ ...item, ...patch }) : item
    );
  }

  function normalizeTask(task: LessonUploadTask): LessonUploadTask {
    return {
      ...task,
      loadedBytes: Math.max(0, task.loadedBytes),
      totalBytes: Math.max(0, task.totalBytes),
      speedBytesPerSecond: Math.max(0, task.speedBytesPerSecond),
      progress: Math.min(100, Math.max(0, Math.round(task.progress)))
    };
  }

  function remove(id: string) {
    items.value = items.value.filter((item) => item.id !== id);
  }

  function cancel(id: string) {
    const task = items.value.find((item) => item.id === id);
    task?.abortController?.abort();
    remove(id);
  }

  return {
    items,
    visibleUploads,
    activeUpload,
    add,
    update,
    cancel,
    remove
  };
});
