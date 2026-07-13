import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const adminPanelsSource = readFileSync(resolve(__dirname, "adminPanels.ts"), "utf-8");
const adminSectionSource = readFileSync(resolve(__dirname, "AdminSection.vue"), "utf-8");
const clientSource = readFileSync(resolve(__dirname, "../../api/client.ts"), "utf-8");
const stylesSource = readFileSync(resolve(__dirname, "../../styles.css"), "utf-8");

describe("admin mailings panel", () => {
  it("adds mailings next to clients in the admin tabs", () => {
    expect(adminPanelsSource).toContain('"users", label: "Клиенты"');
    expect(adminPanelsSource).toContain('"mailings", label: "Рассылки"');
    expect(adminPanelsSource.indexOf('"users"')).toBeLessThan(adminPanelsSource.indexOf('"mailings"'));
    expect(adminPanelsSource.indexOf('"mailings"')).toBeLessThan(adminPanelsSource.indexOf('"payments"'));
  });

  it("offers channel choices, filters, attachments, test send, and ETA", () => {
    expect(adminSectionSource).toContain("Push");
    expect(adminSectionSource).toContain("Email");
    expect(adminSectionSource).toContain("Push + Email");
    expect(adminSectionSource).toContain("Статус доступа");
    expect(adminSectionSource).toContain("Тип доступа");
    expect(adminSectionSource).not.toContain("Бот заблокирован");
    expect(adminSectionSource).not.toContain("В бот");
    expect(adminSectionSource).toContain("Тест себе");
    expect(adminSectionSource).toContain("handleTestMailingDraft");
    expect(adminSectionSource).toContain("Примерное время");
    expect(adminSectionSource).toContain("PWA-подписок");
    expect(adminSectionSource).toContain("Email без адреса");
    expect(adminSectionSource).toContain("pauseAdminMailing");
    expect(adminSectionSource).toContain("stopAdminMailing");
  });

  it("uses push by default and an accessible compact reset action", () => {
    expect(adminSectionSource).toContain('ref<MailingChannel>("push")');
    expect(adminSectionSource).toContain('mailingChannel.value = "push"');
    expect(adminSectionSource).toContain('aria-label="Сбросить форму"');
    expect(adminSectionSource).toContain("<RotateCcw");
  });

  it("creates new mailings from a routed task screen with HTML controls", () => {
    expect(adminSectionSource).toContain("showMailingComposer");
    expect(adminSectionSource).toContain("openMailingComposer");
    expect(adminSectionSource).toContain("admin-mailing-task-screen");
    expect(adminSectionSource).toContain('openAdminTask("/admin/mailings/new")');
    expect(adminSectionSource).not.toContain('aria-modal="true"');
    expect(adminSectionSource).toContain("Новая рассылка");
    expect(adminSectionSource).toContain("applyMailingEditorLink");
    expect(adminSectionSource).toContain("Ссылка");
    expect(adminSectionSource).toContain('class="admin-mailing-builder-body"');
    expect(adminSectionSource).toContain('class="admin-mailing-submit-row admin-mailing-builder-footer"');
  });

  it("keeps the audience calculation block only inside the mailing composer", () => {
    const composerPreviewStart = adminSectionSource.indexOf("admin-mailing-composer-preview");
    const composerPreviewEnd = adminSectionSource.indexOf("admin-mailing-submit-row", composerPreviewStart);
    const composerPreview = adminSectionSource.slice(composerPreviewStart, composerPreviewEnd);

    expect(adminSectionSource).not.toContain('<section class="admin-crm-block admin-mailing-preview">');
    expect(composerPreview).toContain("Пересчитать");
    expect(composerPreview).toContain("Примерное время");
  });

  it("keeps composer submit buttons above the bottom edge", () => {
    expect(stylesSource).toContain(".admin-mailing-task-screen .admin-mailing-builder");
    expect(stylesSource).toMatch(/\.admin-mailing-submit-row\s*\{[^}]*padding-bottom:\s*0\.25rem;/s);
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
