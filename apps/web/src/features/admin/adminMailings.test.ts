import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readAppStyles } from "@/test/appStyles";

const adminPanelsSource = readFileSync(resolve(__dirname, "adminPanels.ts"), "utf-8");
const adminSectionSource = readFileSync(resolve(__dirname, "AdminSection.vue"), "utf-8");
const mailingsPanelSource = readFileSync(resolve(__dirname, "AdminMailingsPanel.vue"), "utf-8");
const clientSource = readFileSync(resolve(__dirname, "../../api/client.ts"), "utf-8");
const stylesSource = readAppStyles("admin");

describe("admin mailings panel", () => {
  it("adds mailings next to clients in the admin tabs", () => {
    expect(adminPanelsSource).toContain('"users", label: "Клиенты"');
    expect(adminPanelsSource).toContain('"mailings", label: "Рассылки"');
    expect(adminPanelsSource.indexOf('"users"')).toBeLessThan(adminPanelsSource.indexOf('"mailings"'));
    expect(adminPanelsSource.indexOf('"mailings"')).toBeLessThan(adminPanelsSource.indexOf('"payments"'));
  });

  it("offers channel choices, filters, attachments, test send, and ETA", () => {
    expect(mailingsPanelSource).toContain("mailingChannelOptions");
    expect(mailingsPanelSource).toContain("Статус доступа");
    expect(mailingsPanelSource).toContain("Тип доступа");
    expect(mailingsPanelSource).not.toContain("Бот заблокирован");
    expect(mailingsPanelSource).not.toContain("В бот");
    expect(mailingsPanelSource).toContain("Тест себе");
    expect(adminSectionSource).toContain("handleTestMailingDraft");
    expect(mailingsPanelSource).toContain("Примерное время");
    expect(mailingsPanelSource).toContain("PWA-подписок");
    expect(mailingsPanelSource).toContain("Email без адреса");
    expect(mailingsPanelSource).toContain("Email за 24 часа");
    expect(mailingsPanelSource).toContain("mailingPreview?.emailQuota.used");
    expect(mailingsPanelSource).toContain("mailingPreview?.emailQuota.remaining");
    expect(adminSectionSource).toContain("pauseAdminMailing");
    expect(adminSectionSource).toContain("stopAdminMailing");
  });

  it("uses push by default and an accessible compact reset action", () => {
    expect(adminSectionSource).toContain('ref<MailingChannel>("push")');
    expect(adminSectionSource).toContain('mailingChannel.value = "push"');
    expect(mailingsPanelSource).toContain('aria-label="Сбросить форму"');
    expect(mailingsPanelSource).toContain("<RotateCcw");
  });

  it("keeps mailing routes and operations in the shell while lazy-loading the panel", () => {
    expect(adminSectionSource).toContain('defineAsyncComponent(() => import("./AdminMailingsPanel.vue"))');
    expect(adminSectionSource).toContain('<AdminMailingsPanel\n      ref="mailingsPanelRef"\n      v-else-if="activePanel === \'mailings\'"');
    expect(adminSectionSource).toContain('@open-detail="openMailingDetail"');
    expect(adminSectionSource).toContain('@retry="handleRetryFailedMailing"');
    expect(adminSectionSource).toContain('openAdminTask("/admin/mailings/new")');
    expect(adminSectionSource).toContain("retryFailedAdminMailing(mailing.id)");
  });

  it("creates new mailings from a routed task screen with HTML controls", () => {
    expect(adminSectionSource).toContain("showMailingComposer");
    expect(adminSectionSource).toContain("openMailingComposer");
    expect(mailingsPanelSource).toContain("admin-mailing-task-screen");
    expect(adminSectionSource).toContain('openAdminTask("/admin/mailings/new")');
    expect(mailingsPanelSource).toContain("Новая рассылка");
    expect(adminSectionSource).toContain("applyMailingEditorLink");
    expect(mailingsPanelSource).toContain("Ссылка");
    expect(mailingsPanelSource).toContain('@paste="emit(\'editor-paste\', $event)"');
    expect(mailingsPanelSource).toContain('class="admin-mailing-builder-body"');
    expect(mailingsPanelSource).toContain('class="admin-mailing-submit-row admin-mailing-builder-footer"');
  });

  it("opens mailing history as a separate routed screen without a manual refresh action", () => {
    expect(adminSectionSource).toContain("const showMailingHistory = ref(false)");
    expect(adminSectionSource).toContain('openAdminTask("/admin/mailings/history")');
    expect(mailingsPanelSource).toContain('title="История рассылок"');
    expect(mailingsPanelSource).toContain('class="admin-mailing-history-entry ui-button"');

    const historyStart = mailingsPanelSource.indexOf('title="История рассылок"');
    const historyEnd = mailingsPanelSource.indexOf("</TaskScreen>", historyStart);
    const historyScreen = mailingsPanelSource.slice(historyStart, historyEnd);
    expect(historyScreen).toContain('v-for="mailing in mailings"');
    expect(historyScreen).not.toContain("@click=\"loadMailings\"");
  });

  it("offers safe visual and HTML source editing with a real message preview", () => {
    expect(adminSectionSource).toContain('import { prepareMailingHtml, type MailingEditorMode } from "./mailingEditorMode"');
    expect(adminSectionSource).toContain('ref<MailingEditorMode>("visual")');
    expect(mailingsPanelSource).toContain("update:mailing-editor-mode");
    expect(mailingsPanelSource).toContain(">Визуально</button>");
    expect(mailingsPanelSource).toContain(">HTML-код</button>");
    expect(mailingsPanelSource).toContain('v-if="mailingEditorMode === \'visual\'"');
    expect(mailingsPanelSource).toContain('class="text-input admin-mailing-html-source"');
    expect(mailingsPanelSource).toContain("mailingPreparedMessage.safeHtml");
    expect(mailingsPanelSource).toContain('v-html="mailingPreparedMessage.safeHtml"');
    expect(adminSectionSource).toContain("syncActiveMailingEditor");
  });

  it("submits safe HTML and derived plain text from either editor mode", () => {
    expect(adminSectionSource).toContain('form.set("body", mailingPreparedMessage.value.plainText)');
    expect(adminSectionSource).toContain('form.set("bodyHtml", mailingPreparedMessage.value.safeHtml)');
    expect(adminSectionSource).toContain("mailingPreparedMessage.value.plainText.length > 0");
  });

  it("keeps the audience calculation block only inside the mailing composer", () => {
    const composerPreviewStart = mailingsPanelSource.indexOf("admin-mailing-composer-preview");
    const composerPreviewEnd = mailingsPanelSource.indexOf("admin-mailing-submit-row", composerPreviewStart);
    const composerPreview = mailingsPanelSource.slice(composerPreviewStart, composerPreviewEnd);

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
    expect(clientSource).toContain("retryFailedAdminMailing");
    expect(clientSource).toContain("/retry-failed");
  });

  it("keeps template reuse separate from retrying failed deliveries", () => {
    expect(adminSectionSource).not.toContain("resetMailingForm();\n    setStatus");
    expect(mailingsPanelSource).toContain("open-detail");
    expect(adminSectionSource).toContain("selectedMailing");
    expect(mailingsPanelSource).toContain("mailingAuthorLabel");
    expect(mailingsPanelSource).toContain("formatDateTime(mailing.createdAt)");
    expect(mailingsPanelSource).toContain("mailing.attachment");
    expect(mailingsPanelSource).toContain("Использовать снова");
    expect(mailingsPanelSource).toContain("Повторить ошибки");
    expect(adminSectionSource).toContain("handleRetryFailedMailing");
    expect(mailingsPanelSource).toContain("mailing.failedCount > 0");
    expect(adminSectionSource).toContain("retryFailedAdminMailing(mailing.id)");
    expect(adminSectionSource).toContain("Ошибочные доставки возвращены в очередь.");
  });

  it("shows compact live delivery state counters", () => {
    expect(mailingsPanelSource).toContain("mailing.pendingCount");
    expect(mailingsPanelSource).toContain("mailing.processingCount");
    expect(mailingsPanelSource).toContain("mailing.skippedCount");
    expect(mailingsPanelSource).toContain("mailing.failedCount");
    expect(mailingsPanelSource).toContain('class="admin-mailing-delivery-stats"');
    expect(stylesSource).toMatch(/\.admin-mailing-delivery-stats\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*wrap;/s);
  });
});
