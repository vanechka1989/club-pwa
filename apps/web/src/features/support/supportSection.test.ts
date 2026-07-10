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
    expect(source).toContain('t("supportCreateTicket")');
    expect(source).toContain("support-topic-options");
    expect(source).toContain("supportMediaTopic");
    expect(source).toContain("supportOtherTopic");
    expect(source).not.toContain("<select v-model=\"topic\">");
    expect(source).toContain("supportSendReply");
    expect(source).toContain("supportFollowupPlaceholder");
    expect(source).not.toContain("Дополнить обращение");
    expect(source).toContain("supportCloseTicket");
    expect(source).toContain("supportWaitingTime");
  });

  it("opens tickets as routed task screens and marks them read only when opened", () => {
    expect(source).toContain('import TaskScreen from "@/features/app/TaskScreen.vue"');
    expect(source).toContain('router.push(`/support/tickets/${ticketId}`)');
    expect(source).toContain('router.push("/support/new")');
    expect(source).toContain("<TaskScreen");
    expect(source).toContain('v-if="createTicketOpen"');
    expect(source).toContain('v-else-if="selectedTicket"');
    expect(source).not.toContain('v-if="selectedTicket" class="support-modal-backdrop"');
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

  it("polls tickets and open support threads without reopening the tab", () => {
    expect(source).toContain("supportRefreshTimer");
    expect(source).toContain("startSupportPolling");
    expect(source).toContain("refreshSupport({ silent: true })");
    expect(source).toContain("refreshSelectedTicketRead");
    expect(source).toMatch(/watch\(\s*\(\) => selectedTicket\.value\?\.messages\.length/s);
  });

  it("uses an in-app close confirmation instead of the browser confirm", () => {
    expect(source).not.toContain("window.confirm");
    expect(source).toContain("closeConfirmOpen");
    expect(source).toContain('import ConfirmDialog from "@/features/app/ConfirmDialog.vue"');
    expect(source).toContain("<ConfirmDialog");
    expect(source).toContain("confirmCloseTicket");
  });

  it("uses preview role for support mode instead of the real admin role", () => {
    expect(source).toContain("isSupportAdminRole");
    expect(source).toMatch(/const isAdmin = computed\(\(\) => isSupportAdminRole\(session\.user\?\.role\)\);/);
    expect(source).not.toContain(
      "isSupportAdminRole(session.user?.realRole) || isSupportAdminRole(session.user?.role)"
    );
    expect(source).toContain('v-else-if="!isAdmin"');
  });

  it("shows average support response time in admin support stats", () => {
    expect(source).toContain("averageResponseTimeLabel");
    expect(source).toContain("supportStatsAverage");
    expect(source).toContain("calculateAverageResponseMinutes");
  });

  it("keeps admin support stats in an even mobile grid", () => {
    expect(styles).toMatch(/\.support-admin-board\s*\{[^}]*display:\s*grid;[^}]*gap:\s*0\.75rem;/s);
    expect(styles).toMatch(/\.support-admin-stats\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/s);
    expect(styles).toMatch(/\.support-admin-stats article\s*\{[^}]*min-height:\s*4\.15rem;[^}]*padding:\s*0\.58rem 0\.65rem;/s);
    expect(styles).toMatch(/\.support-admin-stats article\s*\{[^}]*justify-items:\s*center;[^}]*text-align:\s*center;/s);
    expect(styles).toMatch(/\.support-admin-stats span\s*\{[^}]*font-size:\s*0\.68rem;/s);
    expect(styles).toMatch(/\.support-admin-stats strong\s*\{[^}]*font-size:\s*1\.18rem;/s);
    expect(styles).toMatch(/@media \(min-width:\s*620px\)\s*\{[^}]*\.support-admin-stats\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\);/s);
  });

  it("opens compact attachment pills from the support thread", () => {
    expect(source).toContain("support-attachment-preview");
    expect(source).toContain("support-attachment-open");
    expect(source).toContain("support-attachment-viewer");
    expect(source).toContain("openAttachment(attachment)");
    expect(source).toContain("toggleAttachmentFullscreen");
    expect(source).not.toContain("webkitEnterFullscreen");
    expect(source).not.toContain("requestFullscreen");
    expect(source).toContain("support-attachment-viewer-close");
    expect(source).toContain("<video");
    expect(source).toContain("openedAttachment.kind === 'photo'");
    expect(source).toContain("supportOpenAttachment");
    expect(styles).toContain(".support-attachment-open");
    expect(styles).not.toContain(".support-attachment-preview img");
    expect(styles).toContain(".support-attachment-viewer-fullscreen");
    expect(styles).toContain("width: 100vw");
    expect(styles).toContain("height: var(--club-viewport-height, 100dvh)");
    expect(styles).toContain("border-radius: 0");
    expect(styles).toContain("top: 50%");
    expect(styles).toContain("transform: translateY(-50%)");
    expect(styles).toContain("right: max(4.4rem");
    expect(styles).toContain("backdrop-filter: blur(12px)");
    expect(styles).toContain(".support-attachment-viewer-media");
    expect(styles).toContain("touch-action: pan-x pan-y pinch-zoom");
  });

  it("uses a compact clickable customer row in admin ticket modal", () => {
    expect(source).toContain("support-customer-strip");
    expect(source).toContain("supportOpenClientCard");
    expect(source).not.toContain("support-client-open");
    expect(styles).toContain(".support-customer-strip");
  });

  it("keeps support task actions above the safe bottom area", () => {
    expect(source).toContain("support-ticket-modal-body");
    expect(source).not.toContain('support-secondary-button" type="button" @click="closeModal"');
    expect(styles).toContain(".support-ticket-modal-body");
    expect(styles).toContain(".support-ticket-summary");
    expect(styles).toContain(".support-ticket-modal:not(.support-ticket-modal-compact)");
    expect(styles).toContain(".support-topic-option-active");
    expect(styles).toContain("grid-template-rows: minmax(0, 1fr) auto");
    expect(styles).toContain(".support-ticket-modal-body .support-thread");
    expect(styles).toContain(".support-reply-input-row");
    expect(styles).toContain(".support-file-icon-button");
    expect(styles).toContain(".support-reply-actions .support-danger-button");
    expect(styles).toContain("scroll-padding-bottom");
    expect(styles).toContain(".support-attachment-viewer-close");
    expect(styles).toContain("var(--club-modal-bottom-offset");
  });

  it("keeps support task screens readable above keyboards", () => {
    expect(styles).toContain(".support-task-screen");
    expect(styles).toContain(".support-task-screen .support-ticket-modal-body");
    expect(styles).toContain("padding-bottom: max(1rem, var(--club-safe-bottom))");
    expect(styles).toContain("-webkit-text-fill-color: var(--text)");
    expect(styles).toContain("caret-color: var(--accent)");
  });

  it("localizes support labels instead of hardcoding only Russian UI", () => {
    expect(source).toContain("useI18n");
    expect(source).toContain("ticketTopicTitle");
    expect(source).toContain("ticketStatusLabel");
    expect(source).toContain("currentLocale.value === \"en\" ? \"en-US\" : \"ru-RU\"");
    expect(source).toContain('t("support")');
    expect(source).toContain('t("supportSectionSubtitleAdmin")');
    expect(source).not.toContain("<h2 class=\"section-title\">Поддержка</h2>");
  });

  it("keeps a single support message compact inside ticket modals", () => {
    expect(styles).toMatch(/\.support-thread\s*\{[^}]*align-content:\s*start;/s);
    expect(styles).toMatch(/\.support-message\s*\{[^}]*align-self:\s*start;/s);
  });

  it("supports photo and video attachments without oversized buttons", () => {
    expect(source).toContain('accept="image/*,video/*"');
    expect(source).toContain("support-compact-button");
    expect(styles).toMatch(/\.support-compact-button\s*\{[^}]*min-height:\s*2\.28rem;/s);
  });

  it("uses theme variables for support action button contrast", () => {
    expect(styles).not.toContain("--accent-contrast");
    expect(styles).toMatch(/\.support-primary-button\s*\{[^}]*color:\s*var\(--accent-text\);/s);
    expect(styles).toMatch(/\.support-danger-button\s*\{[^}]*border:[^;]*var\(--danger\)[^;]*;[^}]*color:[^;]*var\(--danger\)[^;]*;/s);
  });

  it("uses soft success and cherry closed tones for support statuses", () => {
    expect(styles).toContain("--success:");
    expect(styles).toContain("--danger-strong:");
    expect(styles).toMatch(/\.support-status-answered\s*\{[^}]*var\(--success\)[^}]*var\(--success-text\)[^}]*\}/s);
    expect(styles).toMatch(/\.support-status-closed\s*\{[^}]*var\(--danger-strong\)[^}]*var\(--danger-text\)[^}]*\}/s);
  });

  it("shows an unread support badge in navigation", () => {
    expect(appSource).toContain("supportUnreadCount");
    expect(appSource).toContain("bottom-nav-badge");
    expect(styles).toMatch(/\.bottom-nav-badge\s*\{/);
  });

  it("sends support errors and success messages to the global notification layer", () => {
    expect(source).toContain("useNotificationsStore");
    expect(source).toContain("showSupportError");
    expect(source).toContain("showSupportSuccess");
    expect(source).toContain("notifications.showError");
    expect(source).toContain("notifications.showSuccess");
  });

  it("keeps bottom navigation above Android system navigation", () => {
    expect(appSource).toContain("--club-system-bottom");
    expect(appSource).toContain("--club-calibrated-bottom-offset");
    expect(appSource).toContain("visualViewport.offsetTop");
    expect(appSource).toContain("visualBottomGap");
    expect(styles).toContain("--nav-bottom-offset");
    expect(styles).toContain("bottom: var(--nav-bottom-offset)");
    expect(styles).toContain("calc(5.4rem + var(--club-calibrated-bottom-offset");
  });
});
