import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { LessonUploadFailure } from "@/features/learning/uploadRecovery";

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
  failure?: LessonUploadFailure;
  abortController?: AbortController;
};

const storageKey = "lesson-upload-errors";

function restoreFailedUploads(): LessonUploadTask[] {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? "[]") as unknown;
    return Array.isArray(value)
      ? value.filter((item): item is LessonUploadTask => Boolean(item && typeof item === "object" && (item as LessonUploadTask).status === "error"))
      : [];
  } catch {
    return [];
  }
}

export const useLessonUploadsStore = defineStore("lessonUploads", () => {
  const items = ref<LessonUploadTask[]>(restoreFailedUploads());
  const visibleUploads = computed(() => items.value);
  const activeUpload = computed(() => items.value.find((item) => item.status !== "done") ?? items.value[0] ?? null);

  function add(task: LessonUploadTask) {
    items.value = [normalizeTask(task), ...items.value.filter((item) => item.id !== task.id)];
    persistFailedUploads();
  }

  function update(id: string, patch: Partial<LessonUploadTask>) {
    items.value = items.value.map((item) =>
      item.id === id ? normalizeTask({ ...item, ...patch }) : item
    );
    persistFailedUploads();
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
    persistFailedUploads();
  }

  function persistFailedUploads() {
    try {
      const failed = items.value
        .filter((item) => item.status === "error")
        .slice(0, 10)
        .map(({ abortController: _abortController, ...item }) => item);
      localStorage.setItem(storageKey, JSON.stringify(failed));
    } catch {
      // Diagnostics must never break the upload flow.
    }
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
