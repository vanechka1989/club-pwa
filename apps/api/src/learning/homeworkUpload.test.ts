import { describe, expect, it } from "vitest";
import { buildHomeworkObjectKey, classifyHomeworkContentType, ownsHomeworkObject } from "./homeworkUpload";

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
});
