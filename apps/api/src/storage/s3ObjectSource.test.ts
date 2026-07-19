import { describe, expect, it } from "vitest";
import { createFallbackS3ObjectSource } from "./s3ObjectSource";

describe("S3 object source snapshots", () => {
  it("classifies learning media without inventing a linked title", () => {
    expect(createFallbackS3ObjectSource("learning/video/lesson.mp4")).toEqual({
      category: "learning",
      categoryLabel: "Уроки",
      fileKind: "Видео урока",
      sourceKind: "learning",
      sourceTitle: null,
      parentTitle: null,
      resolved: false
    });
  });

  it("classifies a community voice attachment", () => {
    expect(createFallbackS3ObjectSource("community/voice/message/voice.webm")).toEqual({
      category: "community",
      categoryLabel: "Общение",
      fileKind: "Голосовое сообщение",
      sourceKind: "community",
      sourceTitle: null,
      parentTitle: null,
      resolved: false
    });
  });

  it("keeps unknown paths readable", () => {
    expect(createFallbackS3ObjectSource("imports/archive.bin")).toEqual({
      category: "other",
      categoryLabel: "Прочее",
      fileKind: "Файл",
      sourceKind: "other",
      sourceTitle: null,
      parentTitle: null,
      resolved: false
    });
  });
});
