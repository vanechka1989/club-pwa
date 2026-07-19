import { describe, expect, it } from "vitest";
import { distinctAuditDetails } from "./adminAuditPresentation";

describe("admin audit presentation", () => {
  it("hides a summary repeated as the event title", () => {
    expect(distinctAuditDetails("Удалил файл из S3: learning/photo/file.webp", "Удалил файл из S3: learning/photo/file.webp")).toBeNull();
    expect(distinctAuditDetails("Удалил файл из S3: file.webp", "  Удалил   файл из S3: file.webp  ")).toBeNull();
  });

  it("keeps useful details when they differ from the title", () => {
    expect(distinctAuditDetails("Настройки проекта", "Реферальное вознаграждение: 10 дней")).toBe("Реферальное вознаграждение: 10 дней");
  });
});
