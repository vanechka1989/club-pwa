import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
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
});
