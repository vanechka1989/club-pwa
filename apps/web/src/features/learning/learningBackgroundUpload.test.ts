import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const learningSectionSource = readFileSync(resolve(__dirname, "LearningSection.vue"), "utf-8");
const apiClientSource = readFileSync(resolve(__dirname, "../../api/client.ts"), "utf-8");
const appSource = readFileSync(resolve(__dirname, "../../App.vue"), "utf-8");
const uploadStoreSource = readFileSync(resolve(__dirname, "../../stores/lessonUploads.ts"), "utf-8");

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
    expect(uploadStoreSource).toContain("visibleUploads");
  });

  it("does not show the manual video rotation control", () => {
    expect(learningSectionSource).not.toContain("lessonVideoRotated");
    expect(learningSectionSource).not.toContain("toggleLessonVideoOrientation");
    expect(learningSectionSource).not.toContain("Повернуть видео");
  });
});
