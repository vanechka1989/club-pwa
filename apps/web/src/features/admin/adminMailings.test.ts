import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const adminPanelsSource = readFileSync(resolve(__dirname, "adminPanels.ts"), "utf-8");
const adminSectionSource = readFileSync(resolve(__dirname, "AdminSection.vue"), "utf-8");
const clientSource = readFileSync(resolve(__dirname, "../../api/client.ts"), "utf-8");

describe("admin mailings panel", () => {
  it("adds mailings next to clients in the admin tabs", () => {
    expect(adminPanelsSource).toContain('"users", label: "Клиенты"');
    expect(adminPanelsSource).toContain('"mailings", label: "Рассылки"');
    expect(adminPanelsSource.indexOf('"users"')).toBeLessThan(adminPanelsSource.indexOf('"mailings"'));
    expect(adminPanelsSource.indexOf('"mailings"')).toBeLessThan(adminPanelsSource.indexOf('"payments"'));
  });

  it("offers channel choices, filters, attachments, test send, and ETA", () => {
    expect(adminSectionSource).toContain("В бот");
    expect(adminSectionSource).toContain("В приложение");
    expect(adminSectionSource).toContain("Везде");
    expect(adminSectionSource).toContain("Статус доступа");
    expect(adminSectionSource).toContain("Тип доступа");
    expect(adminSectionSource).toContain("Бот заблокирован");
    expect(adminSectionSource).toContain("Тест себе");
    expect(adminSectionSource).toContain("handleTestMailingDraft");
    expect(adminSectionSource).toContain("Примерное время");
    expect(adminSectionSource).toContain("pauseAdminMailing");
    expect(adminSectionSource).toContain("stopAdminMailing");
  });

  it("creates new mailings from a modal composer with HTML controls", () => {
    expect(adminSectionSource).toContain("showMailingComposer");
    expect(adminSectionSource).toContain("openMailingComposer");
    expect(adminSectionSource).toContain("admin-mailing-composer-modal");
    expect(adminSectionSource).toContain("Новая рассылка");
    expect(adminSectionSource).toContain("applyMailingEditorLink");
    expect(adminSectionSource).toContain("Ссылка");
  });

  it("keeps audience recalculation only inside the mailing composer", () => {
    const sidePreviewStart = adminSectionSource.indexOf('<section class="admin-crm-block admin-mailing-preview">');
    const sidePreviewEnd = adminSectionSource.indexOf('<section class="admin-crm-block admin-mailing-list">');
    const sidePreview = adminSectionSource.slice(sidePreviewStart, sidePreviewEnd);

    const composerPreviewStart = adminSectionSource.indexOf("admin-mailing-composer-preview");
    const composerPreviewEnd = adminSectionSource.indexOf("admin-mailing-submit-row", composerPreviewStart);
    const composerPreview = adminSectionSource.slice(composerPreviewStart, composerPreviewEnd);

    expect(sidePreview).not.toContain("Пересчитать");
    expect(composerPreview).toContain("Пересчитать");
  });

  it("has API client methods for previewing and controlling mailings", () => {
    expect(clientSource).toContain("previewAdminMailing");
    expect(clientSource).toContain("createAdminMailing");
    expect(clientSource).toContain("testAdminMailingDraft");
    expect(clientSource).toContain('"/admin/mailings/test-draft"');
    expect(clientSource).toContain("testAdminMailing");
    expect(clientSource).toContain("pauseAdminMailing");
    expect(clientSource).toContain("stopAdminMailing");
  });

  it("keeps a sent mailing reusable and exposes history details", () => {
    expect(adminSectionSource).not.toContain("resetMailingForm();\n    setStatus");
    expect(adminSectionSource).toContain("openMailingDetail");
    expect(adminSectionSource).toContain("selectedMailing");
    expect(adminSectionSource).toContain("mailingAuthorLabel");
    expect(adminSectionSource).toContain("formatDateTime(mailing.createdAt)");
    expect(adminSectionSource).toContain("mailing.attachment");
    expect(adminSectionSource).toContain("Повторить");
  });
});
