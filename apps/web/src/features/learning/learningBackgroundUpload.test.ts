import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const learningSectionSource = readFileSync(resolve(__dirname, "LearningSection.vue"), "utf-8");
const apiClientSource = readFileSync(resolve(__dirname, "../../api/client.ts"), "utf-8");

describe("learning background uploads", () => {
  it("uses multipart upload and keeps progress outside the lesson modal", () => {
    expect(apiClientSource).toContain("createAdminLearningMultipartUpload");
    expect(apiClientSource).toContain("completeAdminLearningMultipartUpload");
    expect(learningSectionSource).toContain("backgroundLessonUploads");
    expect(learningSectionSource).toContain("startBackgroundLessonUpload");
    expect(learningSectionSource).toContain("closeLessonModal()");
    expect(learningSectionSource).toContain("Фоновые загрузки");
  });
});
