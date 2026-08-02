import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readAppStyles } from "@/test/appStyles";

const adminSectionSource = readFileSync(resolve(__dirname, "AdminSection.vue"), "utf-8");
const storagePanelSource = readFileSync(resolve(__dirname, "AdminStoragePanel.vue"), "utf-8");
const stylesSource = readAppStyles("admin");

describe("admin storage section", () => {
  it("keeps storage route and permission ownership in the shell while lazy-loading the presentation panel", () => {
    expect(adminSectionSource).toContain('defineAsyncComponent(() => import("./AdminStoragePanel.vue"))');
    expect(adminSectionSource).toContain('<AdminStoragePanel\n      ref="storagePanelRef"\n      v-else-if="activePanel === \'storage\' && canUseStorage"');
    expect(adminSectionSource).toContain('@select-target="openStorageStatusActions"');
    expect(adminSectionSource).toContain('@back="closeStorageTask"');
  });

  it("opens file overview and S3 settings as separate task screens from the storage landing", () => {
    expect(storagePanelSource).toContain("showStorageFilesModal");
    expect(storagePanelSource).toContain("showStorageSettingsModal");
    expect(storagePanelSource).toContain("admin-storage-action-icon");
    expect(storagePanelSource).toContain("admin-storage-action-arrow");
    expect(storagePanelSource).toContain("Обзор файлов");
    expect(storagePanelSource).toContain("Настройки S3");
    expect(storagePanelSource).toContain("S3 основное");
    expect(storagePanelSource).toContain("S3 резервное");
    expect(adminSectionSource).toContain("openStorageStatusActions");
    expect(storagePanelSource).toContain("selectedStorageTarget");
    expect(adminSectionSource).toContain("selectedStorageTargetLabel");
    expect(adminSectionSource).toContain("selectedStorageTargetConfigured");
    expect(storagePanelSource).toContain("selectedStorageSettingsTitle");
    expect(adminSectionSource).toContain("openSelectedStorageFiles");
    expect(adminSectionSource).toContain("admin-preview-mode-trigger");
    expect(adminSectionSource).toContain('title="Режим просмотра"');
    expect(adminSectionSource).not.toContain("admin-preview-switcher");
    expect(adminSectionSource).toContain("ui.setPreviewMode");
    expect(adminSectionSource).toContain('"preview-mode-change": [mode: PreviewMode];');
    expect(adminSectionSource).toContain('emit("preview-mode-change", mode);');
    expect(storagePanelSource).toContain("selectedStorageTarget === 'reserve'");
    expect(adminSectionSource).toContain("storageOverviewObjects.value = [];");
    expect(adminSectionSource).toContain("void loadStorageObjects();");
    expect(adminSectionSource).toContain("getAdminS3Objects(storagePrefix.value, append ? storageObjectsCursor.value : null, selectedStorageTarget.value)");
    expect(adminSectionSource).toContain("getAdminS3ObjectUrl(item.key, selectedStorageTarget.value)");
    expect(adminSectionSource).toContain("deleteAdminS3Object(item.key, selectedStorageTarget.value)");
    expect(storagePanelSource).toContain("v-if=\"selectedStorageTarget === 'primary'\"");
    expect(storagePanelSource).toContain("v-if=\"selectedStorageTarget === 'reserve'\"");
    expect(storagePanelSource).not.toContain("Сейчас открыта");
    expect(storagePanelSource).toContain("admin-storage-action-grid");
    expect(stylesSource).toContain(".admin-storage-current");
    expect(stylesSource).toContain("width: 100%;");
    expect(stylesSource).toContain(".admin-storage-status-grid");
    expect(stylesSource).toContain(".admin-storage-status-card::before");
    expect(stylesSource).toContain("justify-items: center;");
    expect(stylesSource).toContain("justify-content: center;");
    expect(stylesSource).toContain("text-align: center;");
    expect(stylesSource).toContain("min-height: 3.45rem;");
    expect(stylesSource).toContain("font-size: 0.6rem;");
    expect(stylesSource).toContain("border-width: 2px;");
    expect(stylesSource).toContain("0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent)");
    expect(stylesSource).toContain(".admin-storage-status-card-error.admin-storage-status-card-active");
    expect(stylesSource).not.toContain(".admin-storage-status-grid {\n    grid-template-columns: 1fr;");
    expect(adminSectionSource).toContain('openAdminTask("/admin/storage/files")');
    expect(adminSectionSource).toContain('openAdminTask("/admin/storage/settings")');
    expect(storagePanelSource).toContain("<TaskScreen");
    expect(storagePanelSource).toContain('title="Обзор файлов" subtitle="Файлы S3 по папкам и связанным данным." portal');
  });

  it("opens every storage folder in a dedicated task screen and keeps landing actions side by side", () => {
    expect(storagePanelSource).toContain("showStorageFolderModal");
    expect(adminSectionSource).toContain("openStorageFolder");
    expect(storagePanelSource).toContain("admin-storage-folder-modal");
    expect(storagePanelSource).toContain("storageFolderGroups");
    expect(storagePanelSource).toContain("selectedStorageFolder");
    expect(storagePanelSource).toContain("storageFolderSort");
    expect(storagePanelSource).toContain("По дате загрузки");
    expect(storagePanelSource).toContain("По размеру");
    expect(storagePanelSource).toContain("По автору");
    expect(storagePanelSource).toContain("v-for=\"group in storageFolderGroups\"");
    expect(stylesSource).toContain(".admin-storage-action-grid");
    expect(stylesSource).toContain("grid-template-columns: repeat(2, minmax(0, 1fr));");
    expect(stylesSource).not.toContain(".admin-storage-action-grid,\n  .admin-storage-folder-grid");
  });

  it("shows optional reserve S3 settings in the storage settings modal", () => {
    expect(storagePanelSource).toContain("Резервная S3");
    expect(storagePanelSource).toContain("storageForm.reserveEndpoint");
    expect(storagePanelSource).toContain("storageForm.reserveBucket");
    expect(storagePanelSource).toContain("storageForm.reserveAccessKeyId");
    expect(storagePanelSource).toContain("storageSettings?.reserveConfigured");
    expect(storagePanelSource).toContain("Резерв не обязателен");
  });
});
