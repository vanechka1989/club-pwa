import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLessonUploadsStore } from "./lessonUploads";

describe("lesson upload diagnostics", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("persists failed uploads until the user closes them", () => {
    const uploads = useLessonUploadsStore();
    uploads.add({
      id: "upload-1",
      title: "Большой урок",
      status: "error",
      progress: 24,
      detail: "Соединение прервалось",
      loadedBytes: 8,
      totalBytes: 32,
      speedBytesPerSecond: 0,
      startedAt: 100,
      failure: {
        title: "Соединение прервалось",
        detail: "Не удалось передать часть файла.",
        stage: "Дополнительный материал 1",
        code: "UPLOAD_CONNECTION_CLOSED",
        attempts: 3,
        failedAt: 200
      }
    });

    setActivePinia(createPinia());
    const restored = useLessonUploadsStore();
    expect(restored.items).toHaveLength(1);
    expect(restored.items[0]?.progress).toBe(24);
    expect(restored.items[0]?.failure?.code).toBe("UPLOAD_CONNECTION_CLOSED");

    restored.remove("upload-1");
    setActivePinia(createPinia());
    expect(useLessonUploadsStore().items).toHaveLength(0);
  });

  it("continues a paused upload without creating a new lesson task", () => {
    const retry = vi.fn();
    const uploads = useLessonUploadsStore();
    uploads.add({
      id: "upload-2",
      title: "Видео",
      status: "error",
      progress: 38,
      detail: "Соединение прервалось",
      loadedBytes: 38,
      totalBytes: 100,
      speedBytesPerSecond: 0,
      startedAt: 100,
      failure: {
        title: "Соединение прервалось",
        detail: "Часть файла не передана.",
        stage: "Основной файл",
        code: "UPLOAD_CONNECTION_CLOSED",
        attempts: 3,
        failedAt: 200
      },
      retry
    });

    uploads.retry("upload-2");

    expect(retry).toHaveBeenCalledOnce();
    expect(uploads.items).toHaveLength(1);
    expect(uploads.items[0]).toMatchObject({ id: "upload-2", status: "uploading", progress: 38 });
    expect(uploads.items[0]?.failure).toBeUndefined();
  });

  it("cancels the retained multipart session when a paused error is closed", () => {
    const abortController = new AbortController();
    const uploads = useLessonUploadsStore();
    uploads.add({
      id: "upload-3",
      title: "Видео",
      status: "error",
      progress: 20,
      detail: "Ошибка",
      loadedBytes: 20,
      totalBytes: 100,
      speedBytesPerSecond: 0,
      startedAt: 100,
      retry: () => undefined,
      abortController
    });

    uploads.dismiss("upload-3");

    expect(abortController.signal.aborted).toBe(true);
    expect(uploads.items).toHaveLength(0);
  });
});
