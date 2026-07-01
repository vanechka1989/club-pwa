import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const learningSectionSource = readFileSync(resolve(__dirname, "LearningSection.vue"), "utf-8");
const apiClientSource = readFileSync(resolve(__dirname, "../../api/client.ts"), "utf-8");
const appSource = readFileSync(resolve(__dirname, "../../App.vue"), "utf-8");
const uploadStoreSource = readFileSync(resolve(__dirname, "../../stores/lessonUploads.ts"), "utf-8");
const stylesSource = readFileSync(resolve(__dirname, "../../styles.css"), "utf-8");

describe("learning background uploads", () => {
  it("uses multipart upload and keeps progress in a global status bar", () => {
    expect(apiClientSource).toContain("createAdminLearningMultipartUpload");
    expect(apiClientSource).toContain("completeAdminLearningMultipartUpload");
    expect(learningSectionSource).toContain("useLessonUploadsStore");
    expect(learningSectionSource).toContain("startBackgroundLessonUpload");
    expect(learningSectionSource).toContain("closeLessonModal()");
    expect(learningSectionSource).not.toContain("Фоновые загрузки");
    expect(appSource).toContain("global-upload-status");
    expect(appSource).toContain("lessonUploads.visibleUploads");
    expect(appSource).toContain("Не закрывайте и не сворачивайте приложение");
    expect(appSource).toContain("formatUploadBytes");
    expect(appSource).toContain("formatUploadSpeed");
    expect(appSource).toContain("formatUploadEta");
    expect(appSource).toContain("lessonUploads.remove");
    expect(uploadStoreSource).toContain("visibleUploads");
    expect(uploadStoreSource).toContain("loadedBytes");
    expect(uploadStoreSource).toContain("totalBytes");
    expect(uploadStoreSource).toContain("speedBytesPerSecond");
  });

  it("allows collapsing the global upload status to the progress indicator", () => {
    expect(appSource).toContain("uploadStatusCollapsed");
    expect(appSource).toContain("global-upload-status-collapsed");
    expect(appSource).toContain("Свернуть статус загрузки");
    expect(appSource).toContain("Развернуть статус загрузки");
    expect(stylesSource).toContain(".global-upload-status-collapsed");
  });

  it("does not show the manual video rotation control", () => {
    expect(learningSectionSource).not.toContain("lessonVideoRotated");
    expect(learningSectionSource).not.toContain("toggleLessonVideoOrientation");
    expect(learningSectionSource).not.toContain("Повернуть видео");
  });

  it("keeps lesson editor compact and places fullscreen close below telegram controls", () => {
    expect(learningSectionSource).not.toContain('class="lesson-preview-body"');
    expect(learningSectionSource).not.toContain('class="lesson-preview-copy"');
    expect(stylesSource).toContain(".lesson-video-exit-fullscreen-button");
    expect(stylesSource).toContain("top: max(3.9rem");
    expect(stylesSource).toContain("background: color-mix(in srgb, #020617 34%, transparent)");
  });
});
