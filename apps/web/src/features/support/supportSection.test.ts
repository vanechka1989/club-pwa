import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "SupportSection.vue"), "utf8");
const styles = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");
const appSource = readFileSync(resolve(__dirname, "../../App.vue"), "utf8");

function latestRule(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...styles.matchAll(new RegExp(`(?:^|}\\s*)${escaped}\\s*\\{(?<body>[^}]*)\\}`, "g"))];
  return matches.at(-1)?.groups?.body ?? "";
}

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
    expect(appSource).toContain("supportClientTicketId");
    expect(appSource).toContain("handleAdminClientCardClose");
  });

  it("opens an admin client card as a nested support task and returns to the same ticket", () => {
    expect(appSource).toContain("supportClientTelegramId");
    expect(appSource).toContain("supportClientTicketId");
    expect(appSource).toContain("/support/tickets/${encodeURIComponent(ticketId)}/clients/${encodeURIComponent(telegramId)}");
    expect(appSource).toContain("client-card-only");
    expect(appSource).toContain("/support/tickets/${encodeURIComponent(ticketId)}");
    expect(appSource).not.toContain('await selectSection("admin")');
    expect(source).toContain("isCurrentTicketTaskPath");
  });

  it("renders support task screens as full-screen routed surfaces", () => {
    expect(source).toMatch(/<TaskScreen[\s\S]*v-if="createTicketOpen"[\s\S]*\sportal[\s\S]*@back="closeCreateTicket"/);
    expect(source).toMatch(/<TaskScreen[\s\S]*v-else-if="selectedTicket"[\s\S]*\sportal[\s\S]*@back="closeModal"/);

    expect(styles).toContain(".support-task-screen.task-screen-route-layer");
    expect(styles).toContain(".support-task-screen.task-screen-route-layer > .task-screen");
    expect(styles).toContain("height: var(--club-visible-viewport-height, 100dvh)");
    expect(styles).toContain("border-radius: 0");
  });

  it("uses a chat-style ticket body and keyboard-safe reply composer", () => {
    const ticketBodyRule = latestRule(".support-task-screen .support-ticket-modal-body");
    const footerRule = latestRule(".task-screen-footer");
    const replyFormRule = latestRule(".support-task-screen .support-reply-form");
    const keyboardFooterRule = latestRule("body.club-keyboard-open .support-ticket-task-screen .task-screen-footer,\nbody.club-keyboard-open .support-task-screen .support-reply-form");

    expect(ticketBodyRule).toContain("border: 0");
    expect(ticketBodyRule).toContain("background: transparent");
    expect(ticketBodyRule).toContain("box-shadow: none");
    expect(footerRule).toContain("position: sticky");
    expect(footerRule).toContain("bottom: 0");
    expect(replyFormRule).toContain("border-top: 1px solid var(--border)");
    expect(keyboardFooterRule).toContain("position: static");
  });

  it("keeps new-ticket submission in the task footer above the iOS keyboard", () => {
    const createForm = source.match(/<form id="support-create-ticket-form"[\s\S]*?<\/form>/)?.[0] ?? "";

    expect(source).toContain('id="support-create-ticket-form"');
    expect(source).toMatch(/<template #footer>[\s\S]*form="support-create-ticket-form"/);
    expect(createForm).not.toContain("support-primary-button");
  });

  it("does not add a keyboard-sized safe inset to support footers", () => {
    const keyboardFooterSpacingRule = latestRule("body.club-keyboard-open .support-task-screen .task-screen-footer");

    expect(keyboardFooterSpacingRule).toContain("padding-bottom: 12px");
    expect(keyboardFooterSpacingRule).not.toContain("--club-safe-bottom");
    expect(keyboardFooterSpacingRule).not.toContain("--club-keyboard-bottom");
  });

  it("prevents iOS focus zoom in both support composers at reduced interface scales", () => {
    const iosSupportFieldRule = latestRule(
      "body.club-ios .support-task-screen :is(.support-field input, .support-field select, .support-field textarea, .support-reply-form textarea)"
    );

    expect(iosSupportFieldRule).toContain("font-size: 16px");
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

  it("fully exits the ticket task after a successful close and shows who closed it", () => {
    const closeHandler = source.match(/async function confirmCloseTicket\(\)[\s\S]*?\n}\n/)?.[0] ?? "";

    expect(closeHandler).toContain("replaceTicket(response.ticket)");
    expect(closeHandler).toContain("closeModal()");
    expect(closeHandler).not.toContain("selectedTicketId.value = response.ticket.id");
    expect(source).toContain("ticketClosedByLabel");
    expect(source).toContain("supportClosedBy");
    expect(source).toContain("support-ticket-closed-by");
    expect(styles).toContain(".support-ticket-closed-by");
  });

  it("uses preview role for support mode instead of the real admin role", () => {
    expect(source).toContain("hasAdminCapability");
    expect(source).toContain('hasAdminCapability(session.user?.role, session.user?.adminPermissions, "support")');
    expect(source).not.toContain(
      "isSupportAdminRole(session.user?.realRole) || isSupportAdminRole(session.user?.role)"
    );
    expect(source).toContain('v-else-if="!isAdmin"');
  });

  it("applies support permission changes immediately without retaining admin tickets", () => {
    expect(source).toContain("watch(isAdmin");
    expect(source).toContain("supportModeVersion");
    expect(source).toContain("tickets.value = []");
    expect(source).toContain("selectedTicketId.value = null");
    expect(source).toContain('router.replace("/support")');
    expect(source).toContain("modeChanged");
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

  it("opens support photos in the same frameless gesture viewer as chat images", () => {
    expect(source).toContain("support-attachment-preview");
    expect(source).toContain("support-attachment-open");
    expect(source).toContain("support-attachment-viewer");
    expect(source).toContain("openAttachment(attachment)");
    expect(source).toContain("useImageViewerGestures");
    expect(source).toContain("attachmentImageViewer.imageStyle.value");
    expect(source).toContain('@pointermove="attachmentImageViewer.onPointerMove"');
    expect(source).toContain('@dblclick="attachmentImageViewer.toggleZoom"');
    expect(source).toContain("support-attachment-viewer-stage");
    expect(source).not.toContain("toggleAttachmentFullscreen");
    expect(source).not.toContain("support-attachment-viewer-panel");
    expect(source).not.toContain("support-attachment-viewer-fullscreen");
    expect(source).not.toContain("webkitEnterFullscreen");
    expect(source).not.toContain("requestFullscreen");
    expect(source).toContain("<video");
    expect(source).toContain("openedAttachment.kind === 'photo'");
    expect(source).toContain("supportOpenAttachment");
    expect(styles).toContain(".support-attachment-open");
    expect(styles).not.toContain(".support-attachment-preview img");
    expect(styles).toMatch(/\.support-attachment-viewer\s*\{[^}]*padding:\s*0;[^}]*background:\s*#000;/s);
    expect(styles).toMatch(/\.support-attachment-viewer-stage\s*\{[^}]*width:\s*100vw;[^}]*height:\s*var\(--club-viewport-height, 100dvh\);[^}]*touch-action:\s*none;/s);
    expect(styles).toMatch(/\.support-attachment-viewer-stage > :is\(img, video\)\s*\{[^}]*border:\s*0;[^}]*border-radius:\s*0;[^}]*object-fit:\s*contain;/s);
    const viewerLayer = Number.parseInt(styles.match(/\.support-attachment-viewer\s*\{[^}]*z-index:\s*(\d+)/s)?.[1] ?? "0", 10);
    const taskLayers = [...styles.matchAll(/\.task-screen-route-layer\s*\{[^}]*z-index:\s*(\d+)/gs)].map((match) => Number.parseInt(match[1] ?? "0", 10));
    const taskLayer = Math.max(0, ...taskLayers);
    expect(viewerLayer).toBeGreaterThan(taskLayer);
  });

  it("uses a compact clickable customer row in admin ticket modal", () => {
    expect(source).toContain("support-customer-strip");
    expect(source).toContain("supportOpenClientCard");
    expect(source).not.toContain("support-client-open");
    expect(styles).toContain(".support-customer-strip");
  });

  it("keeps the support ticket header action compact instead of reusing the full customer summary", () => {
    expect(source).toContain("support-ticket-client-action");
    expect(styles).toContain(".support-ticket-client-action");
    expect(styles).toContain("width: var(--button-height-large)");
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

  it("uses red closed, blue answered, and orange waiting status tones", () => {
    expect(latestRule(".support-section .support-status-closed")).toMatch(/var\(--danger\)/);
    expect(latestRule(".support-section .support-status-closed")).toMatch(/var\(--danger-text\)/);
    expect(latestRule(".support-section .support-status-answered")).toMatch(/var\(--accent\)/);
    expect(latestRule(".support-section .support-status-open")).toMatch(/var\(--warning\)/);
    expect(latestRule(".support-section .support-status-hot")).toMatch(/var\(--warning\)/);
  });

  it("aligns support statistics and tickets to the shared header gutter", () => {
    expect(latestRule(".support-section .support-admin-board")).toMatch(/padding:\s*0/);
    expect(latestRule(".support-section .support-admin-board")).toMatch(/width:\s*100%/);
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
