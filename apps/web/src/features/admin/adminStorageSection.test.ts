import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const adminSectionSource = readFileSync(resolve(__dirname, "AdminSection.vue"), "utf-8");

describe("admin storage section", () => {
  it("opens file overview and S3 settings as separate modals from the storage landing", () => {
    expect(adminSectionSource).toContain("showStorageFilesModal");
    expect(adminSectionSource).toContain("showStorageSettingsModal");
    expect(adminSectionSource).toContain("Обзор файлов");
    expect(adminSectionSource).toContain("Настройки S3");
    expect(adminSectionSource).toContain("admin-storage-action-grid");
    expect(adminSectionSource).toContain("<Teleport to=\"body\">");
  });
});
