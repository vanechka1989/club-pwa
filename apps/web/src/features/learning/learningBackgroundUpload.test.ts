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
    expect(appSource).toContain("lessonUploads.dismiss");
    expect(uploadStoreSource).toContain("visibleUploads");
    expect(uploadStoreSource).toContain("loadedBytes");
    expect(uploadStoreSource).toContain("totalBytes");
    expect(uploadStoreSource).toContain("speedBytesPerSecond");
    expect(learningSectionSource).toContain("runUploadWithRetry");
    expect(learningSectionSource).toContain("runWithConcurrency(chunks, 1");
  });

  it("shows and records the exact final upload failure instead of a false 100 percent", () => {
    expect(uploadStoreSource).toContain("failure?: LessonUploadFailure");
    expect(uploadStoreSource).toContain("lesson-upload-errors");
    expect(appSource).toContain("global-upload-status-error-detail");
    expect(appSource).toContain("failure.stage");
    expect(appSource).toContain("failure.code");
    expect(learningSectionSource).toContain("describeLessonUploadFailure");
    expect(learningSectionSource).toContain("reportClientError");
    expect(learningSectionSource).not.toContain('status: "error",\n      detail: error instanceof Error');
    expect(stylesSource).toContain(".global-upload-status-error-detail");
    expect(appSource).toContain("Продолжить загрузку");
    expect(uploadStoreSource).toContain("retry?: (() => void)");
    expect(learningSectionSource).toContain("createManualUploadRetryGate");
    expect(learningSectionSource).toContain("onManualRetryRequired");
  });

  it("authenticates every XMLHttpRequest upload part like the regular API client", () => {
    expect(apiClientSource).toContain("export function getApiRequestHeaders");
    expect(learningSectionSource).toContain("getApiRequestHeaders");
    expect(learningSectionSource).toContain("request.setRequestHeader(name, value)");
  });

  it("shows a compact circular upload indicator that opens details", () => {
    expect(appSource).toContain("uploadDetailsOpen");
    expect(appSource).toContain("global-upload-indicator");
    expect(appSource).toContain("global-upload-panel");
    expect(appSource).toContain("stroke-dasharray");
    expect(appSource).toContain("Открыть статус загрузки");
    expect(appSource).toContain("Закрыть статус загрузки");
    expect(appSource).toContain("toggleUploadDetails");
    expect(appSource).toContain('@click="toggleUploadDetails"');
    expect(stylesSource).toContain(".global-upload-indicator");
    expect(stylesSource).toContain(".global-upload-panel");
  });

  it("allows cancelling an active lesson upload", () => {
    expect(uploadStoreSource).toContain("cancel");
    expect(uploadStoreSource).toContain("abortController");
    expect(appSource).toContain("Отменить");
    expect(appSource).toContain("lessonUploads.cancel");
    expect(learningSectionSource).toContain("AbortController");
    expect(learningSectionSource).toContain("signal");
    expect(stylesSource).toContain("top: max(2.2rem");
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
    expect(stylesSource).toContain("top: max(4.6rem");
    expect(stylesSource).toContain("background: color-mix(in srgb, var(--panel-strong) 78%, transparent)");
    expect(stylesSource).toContain("@media (orientation: landscape)");
  });
});
