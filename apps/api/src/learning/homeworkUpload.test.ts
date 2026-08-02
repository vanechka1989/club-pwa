import { describe, expect, it } from "vitest";
import { buildHomeworkObjectKey, classifyHomeworkContentType, createHomeworkUploadIntent, ownsHomeworkObject, validateHomeworkUploadStreamRequest } from "./homeworkUpload";

describe("homework direct uploads", () => {
  it("builds user-isolated object keys", () => {
    const key = buildHomeworkObjectKey({ userId: "user-id", token: "upload-id", fileName: "Мой отчёт.pdf", now: new Date("2026-08-01T12:00:00Z") });
    expect(key).toBe("homework/pending/user-id/2026-08-01/upload-id-pdf");
    expect(ownsHomeworkObject(key, "user-id")).toBe(true);
    expect(ownsHomeworkObject(key, "another-user")).toBe(false);
  });

  it("classifies supported images, documents and videos", () => {
    expect(classifyHomeworkContentType("image/png")).toBe("image");
    expect(classifyHomeworkContentType("application/pdf")).toBe("document");
    expect(classifyHomeworkContentType("video/mp4")).toBe("video");
    expect(classifyHomeworkContentType("text/html")).toBeNull();
  });

  it("creates an expiring same-origin upload route bound to the user and token", () => {
    const intent = createHomeworkUploadIntent({
      userId: "user-id",
      lessonId: "lesson-id",
      uploadToken: "upload-id",
      input: { fileName: "result.jpg", contentType: "image/jpeg", sizeBytes: 4 },
      now: new Date("2026-08-02T15:00:00Z")
    });

    expect(intent.objectKey).toBe("homework/pending/user-id/2026-08-02/upload-id-result.jpg");
    expect(intent.uploadUrl).toContain("/learning/items/lesson-id/homework/uploads/upload-id?");
    expect(intent.uploadUrl).toContain("contentType=image%2Fjpeg");
    expect(intent.expiresAt).toBe("2026-08-02T15:10:00.000Z");
  });

  it("accepts only the expected authenticated upload stream", () => {
    const uploaded = { objectKey: "homework/pending/user-id/2026-08-02/upload-id-result.jpg", fileName: "result.jpg", contentType: "image/jpeg", sizeBytes: 4 };
    expect(validateHomeworkUploadStreamRequest({
      uploaded,
      userId: "user-id",
      uploadToken: "upload-id",
      contentLength: 4,
      contentType: "image/jpeg",
      hasBody: true,
      expiresAt: new Date("2026-08-02T15:10:00Z"),
      now: new Date("2026-08-02T15:05:00Z")
    })).toEqual({ ok: true });
    expect(validateHomeworkUploadStreamRequest({
      uploaded,
      userId: "another-user",
      uploadToken: "upload-id",
      contentLength: 4,
      contentType: "image/jpeg",
      hasBody: true,
      expiresAt: new Date("2026-08-02T15:10:00Z"),
      now: new Date("2026-08-02T15:05:00Z")
    })).toEqual({ ok: false, error: "foreign_object" });
  });
});
