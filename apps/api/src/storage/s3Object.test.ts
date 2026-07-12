import { describe, expect, it } from "vitest";
import { classifyS3ObjectKey, normalizeS3ObjectKey, normalizeS3ObjectPrefix } from "./s3Object";

describe("S3 object helpers", () => {
  it("normalizes object prefixes for listing", () => {
    expect(normalizeS3ObjectPrefix("/learning//")).toBe("learning/");
    expect(normalizeS3ObjectPrefix(" support/tickets ")).toBe("support/tickets/");
    expect(normalizeS3ObjectPrefix("")).toBe("");
  });

  it("rejects empty keys and folder keys for destructive actions", () => {
    expect(normalizeS3ObjectKey(" /learning/file.webp ")).toBe("learning/file.webp");
    expect(() => normalizeS3ObjectKey("")).toThrow("S3 object key is required");
    expect(() => normalizeS3ObjectKey("learning/")).toThrow("S3 object key must point to a file");
  });

  it("classifies storage objects by source folder", () => {
    expect(classifyS3ObjectKey("learning/video/lesson.mp4")).toEqual({
      category: "learning",
      categoryLabel: "Уроки",
      fileKind: "Видео урока"
    });
    expect(classifyS3ObjectKey("learning/thumbnails/card.webp")).toEqual({
      category: "learning",
      categoryLabel: "Уроки",
      fileKind: "Обложка урока"
    });
    expect(classifyS3ObjectKey("support/tickets/file.jpg")).toEqual({
      category: "support",
      categoryLabel: "Поддержка",
      fileKind: "Файл обращения"
    });
    expect(classifyS3ObjectKey("mailings/attachment.pdf")).toEqual({
      category: "mailings",
      categoryLabel: "Рассылки",
      fileKind: "Вложение рассылки"
    });
    expect(classifyS3ObjectKey("community/voice/message/voice.webm")).toEqual({
      category: "community",
      categoryLabel: "Общение",
      fileKind: "Голосовое сообщение"
    });
    expect(classifyS3ObjectKey("community/images/message/photo.webp")).toEqual({
      category: "community",
      categoryLabel: "Общение",
      fileKind: "Изображение чата"
    });
    expect(classifyS3ObjectKey("unknown/file.bin")).toEqual({
      category: "other",
      categoryLabel: "Прочее",
      fileKind: "Файл"
    });
  });
});
