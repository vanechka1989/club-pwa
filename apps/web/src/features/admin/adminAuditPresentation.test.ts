import type { AdminActionLog } from "@club/shared";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { distinctAuditDetails, getS3DeletionPresentation } from "./adminAuditPresentation";

const panelSource = readFileSync(resolve(__dirname, "AdminProjectSettingsPanel.vue"), "utf8");

function deletionLog(metadata: Record<string, unknown>): AdminActionLog {
  return {
    id: "log-1",
    action: "storage.s3.object.deleted",
    entityType: "storage",
    entityId: "learning/video/file.mp4",
    targetTelegramId: null,
    summary: "Удалил файл из S3",
    metadata,
    actor: null,
    target: null,
    createdAt: "2026-07-19T12:00:00.000Z"
  };
}

describe("admin audit presentation", () => {
  it("hides a summary repeated as the event title", () => {
    expect(distinctAuditDetails("Удалил файл из S3: learning/photo/file.webp", "Удалил файл из S3: learning/photo/file.webp")).toBeNull();
    expect(distinctAuditDetails("Удалил файл из S3: file.webp", "  Удалил   файл из S3: file.webp  ")).toBeNull();
  });

  it("keeps useful details when they differ from the title", () => {
    expect(distinctAuditDetails("Настройки проекта", "Реферальное вознаграждение: 10 дней")).toBe("Реферальное вознаграждение: 10 дней");
  });

  it("describes a card inside a named lesson", () => {
    expect(getS3DeletionPresentation(deletionLog({
      key: "learning/video/file.mp4",
      source: {
        category: "learning",
        categoryLabel: "Уроки",
        fileKind: "Видео урока",
        sourceKind: "lesson_material",
        sourceTitle: "Видео 1",
        parentTitle: "Основы",
        resolved: true
      }
    }))).toEqual({
      source: "Источник: урок «Основы» · карточка «Видео 1»",
      key: "learning/video/file.mp4"
    });
  });

  it("describes a voice message in a named community topic", () => {
    expect(getS3DeletionPresentation(deletionLog({
      key: "community/voice/voice.webm",
      source: {
        category: "community",
        categoryLabel: "Общение",
        fileKind: "Голосовое сообщение",
        sourceKind: "community",
        sourceTitle: "Новости",
        parentTitle: null,
        resolved: true
      }
    }))).toEqual({
      source: "Источник: общение · тема «Новости» · голосовое сообщение",
      key: "community/voice/voice.webm"
    });
  });

  it("uses path classification when an exact link is unavailable", () => {
    expect(getS3DeletionPresentation(deletionLog({
      key: "learning/photo/file.webp",
      source: {
        category: "learning",
        categoryLabel: "Уроки",
        fileKind: "Фото урока",
        sourceKind: "learning",
        sourceTitle: null,
        parentTitle: null,
        resolved: false
      }
    }))).toEqual({
      source: "Источник: Уроки · Фото урока",
      key: "learning/photo/file.webp"
    });
  });

  it("ignores malformed metadata and renders the technical key separately", () => {
    expect(getS3DeletionPresentation(deletionLog({ source: { category: "learning" } }))).toBeNull();
    expect(panelSource).toContain("getS3DeletionPresentation");
    expect(panelSource).toContain("audit-object-key");
    expect(panelSource).toContain("S3: {{ deletionPresentation(log)?.key }}");
  });
});
