import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "SupportSection.vue"), "utf8");
const styles = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");
const appSource = readFileSync(resolve(__dirname, "../../App.vue"), "utf8");

describe("support section", () => {
  it("has separate customer and admin support experiences", () => {
    expect(source).toContain("support-customer-form");
    expect(source).toContain("support-admin-board");
    expect(source).toContain("Обратиться в поддержку");
    expect(source).toContain("Другая причина");
    expect(source).toContain("Отправить ответ");
    expect(source).toContain("Дополнить обращение");
    expect(source).toContain("Закрыть обращение");
    expect(source).toContain("Время ожидания");
  });

  it("opens tickets in a modal and marks them read only when opened", () => {
    expect(source).toContain("support-ticket-modal");
    expect(source).toContain("openTicket(ticket.id)");
    expect(source).toContain("markSupportTicketRead");
    expect(source).toContain("createSupportTicketMessage");
    expect(source).toContain("closeSupportTicket");
    expect(source).toContain("scrollThreadToLatest");
    expect(source).toContain('emit("open-client"');
    expect(source).toContain('emit("return-ticket-consumed")');
    expect(appSource).toContain("supportReturnTicketId");
    expect(appSource).toContain("handleAdminClientCardClose");
  });

  it("renders attachments inside the support thread", () => {
    expect(source).toContain("support-attachment-preview");
    expect(source).toContain("support-attachment-open");
    expect(source).toContain("support-attachment-viewer");
    expect(source).toContain("openAttachment(attachment)");
    expect(source).toContain("support-attachment-viewer-close");
    expect(source).toContain("<video");
    expect(source).toContain("attachment.kind === 'photo'");
    expect(styles).toContain(".support-attachment-preview img");
    expect(styles).toContain(".support-attachment-viewer-media");
    expect(styles).toContain("touch-action: pan-x pan-y pinch-zoom");
  });

  it("uses a compact clickable customer row in admin ticket modal", () => {
    expect(source).toContain("support-customer-strip");
    expect(source).toContain('title="Открыть карточку клиента"');
    expect(source).not.toContain("support-client-open");
    expect(styles).toContain(".support-customer-strip");
  });

  it("keeps support modal actions above the safe bottom area", () => {
    expect(styles).toContain("scroll-padding-bottom");
    expect(styles).toContain(".support-attachment-viewer-close");
    expect(styles).toContain("var(--tg-safe-bottom");
  });

  it("supports photo and video attachments without oversized buttons", () => {
    expect(source).toContain('accept="image/*,video/*"');
    expect(source).toContain("support-compact-button");
    expect(styles).toMatch(/\.support-compact-button\s*\{[^}]*min-height:\s*2\.45rem;/s);
  });

  it("shows an unread support badge in navigation", () => {
    expect(appSource).toContain("supportUnreadCount");
    expect(appSource).toContain("bottom-nav-badge");
    expect(styles).toMatch(/\.bottom-nav-badge\s*\{/);
  });
});
