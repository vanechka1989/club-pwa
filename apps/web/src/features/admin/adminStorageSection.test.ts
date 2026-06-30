import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const adminSectionSource = readFileSync(resolve(__dirname, "AdminSection.vue"), "utf-8");
const stylesSource = readFileSync(resolve(__dirname, "../../styles.css"), "utf-8");

describe("admin storage section", () => {
  it("opens file overview and S3 settings as separate modals from the storage landing", () => {
    expect(adminSectionSource).toContain("showStorageFilesModal");
    expect(adminSectionSource).toContain("showStorageSettingsModal");
    expect(adminSectionSource).toContain("admin-storage-action-icon");
    expect(adminSectionSource).toContain("admin-storage-action-arrow");
    expect(adminSectionSource).toContain("Обзор файлов");
    expect(adminSectionSource).toContain("Настройки S3");
    expect(adminSectionSource).toContain("S3 основное");
    expect(adminSectionSource).toContain("S3 резервное");
    expect(adminSectionSource).toContain("openStorageStatusActions");
    expect(adminSectionSource).toContain("selectedStorageTarget");
    expect(adminSectionSource).not.toContain("Сейчас открыта");
    expect(adminSectionSource).toContain("admin-storage-action-grid");
    expect(stylesSource).toContain(".admin-storage-current");
    expect(stylesSource).toContain("justify-content: center;");
    expect(stylesSource).toContain("text-align: center;");
    expect(stylesSource).not.toContain(".admin-storage-status-grid {\n    grid-template-columns: 1fr;");
    expect(adminSectionSource).toContain("<Teleport to=\"body\">");
  });

  it("opens every storage folder in a dedicated file modal and keeps landing actions side by side", () => {
    expect(adminSectionSource).toContain("showStorageFolderModal");
    expect(adminSectionSource).toContain("openStorageFolder");
    expect(adminSectionSource).toContain("admin-storage-folder-modal");
    expect(adminSectionSource).toContain("storageFolderGroups");
    expect(adminSectionSource).toContain("selectedStorageFolder");
    expect(adminSectionSource).toContain("storageFolderSort");
    expect(adminSectionSource).toContain("По дате загрузки");
    expect(adminSectionSource).toContain("По размеру");
    expect(adminSectionSource).toContain("По автору");
    expect(adminSectionSource).toContain("v-for=\"group in storageFolderGroups\"");
    expect(stylesSource).toContain(".admin-storage-action-grid");
    expect(stylesSource).toContain("grid-template-columns: repeat(2, minmax(0, 1fr));");
    expect(stylesSource).not.toContain(".admin-storage-action-grid,\n  .admin-storage-folder-grid");
  });

  it("shows optional reserve S3 settings in the storage settings modal", () => {
    expect(adminSectionSource).toContain("Резервная S3");
    expect(adminSectionSource).toContain("storageForm.reserveEndpoint");
    expect(adminSectionSource).toContain("storageForm.reserveBucket");
    expect(adminSectionSource).toContain("storageForm.reserveAccessKeyId");
    expect(adminSectionSource).toContain("storageSettings?.reserveConfigured");
    expect(adminSectionSource).toContain("Резерв не обязателен");
  });
});
