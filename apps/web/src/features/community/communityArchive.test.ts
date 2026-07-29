import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readAppStyles } from "@/test/appStyles";

const sectionSource = readFileSync(resolve(__dirname, "CommunitySection.vue"), "utf8");
const topicListSource = readFileSync(resolve(__dirname, "ChatTopicList.vue"), "utf8");
const roomSource = readFileSync(resolve(__dirname, "ChatRoom.vue"), "utf8");
const messageSource = readFileSync(resolve(__dirname, "ChatMessage.vue"), "utf8");
const moderationSource = readFileSync(resolve(__dirname, "ChatModerationMenu.vue"), "utf8");
const styles = readAppStyles("community");
const communityStyles = readFileSync(resolve(__dirname, "community.css"), "utf8");
const foundation = readFileSync(resolve(__dirname, "../ui/foundation.css"), "utf8");
const main = readFileSync(resolve(__dirname, "../../main.ts"), "utf8");

describe("community archive labels", () => {
  it("shows when archived topics will be deleted", () => {
    expect(topicListSource).toContain("formatArchiveDeletionLabel(topic.archivedUntil)");
    expect(topicListSource).not.toContain("В архиве до {{ formatArchiveUntil");
  });

  it("uses the shared viewport measurement instead of a second chat viewport", () => {
    expect(sectionSource).not.toContain("--club-chat-viewport-height");
    expect(sectionSource).not.toContain("bindChatViewportHeight");
  });

  it("loads the canonical community stylesheet only with the lazy community section", () => {
    expect(main).toContain('import "./features/ui/foundation.css"');
    expect(main).not.toContain('import "./features/community/community.css"');
    expect(sectionSource).toContain('import "./community.css"');
    expect(foundation).not.toContain(".community-chat-open .chat-room");
  });

  it("does not show a chat update alert for automatic polling failures", () => {
    expect(sectionSource).toContain("void refreshSelectedTopic({ silent: true });");
  });

  it("uses the compact shared gap below the community header", () => {
    expect(sectionSource).toContain('class="community-section-content"');
    const rule = styles.match(/\.community-section-content\s*\{(?<body>[^}]*)\}/g)?.at(-1) ?? "";

    expect(rule).toMatch(/gap:\s*8px/);
    expect(styles).toMatch(/\.section-head\.ui-page-header\s*\{[^}]*margin-bottom:\s*4px/s);
  });

  it("keeps chat chrome full width and the composer in the last viewport row", () => {
    expect(communityStyles).toMatch(/\.community-chat-open \.community-chat-shell\s*\{[^}]*height:\s*100%;/s);
    expect(communityStyles).toMatch(/\.community-chat-open \.chat-room\s*\{[^}]*grid-template-rows:\s*auto auto minmax\(0, 1fr\) auto;/s);
    expect(communityStyles).toMatch(/\.community-chat-open \.chat-compose,[^}]*width:\s*100%;[^}]*max-width:\s*none;/s);
    expect(communityStyles).toMatch(/\.community-chat-open \.chat-room-header\s*\{[^}]*width:\s*100%;/s);
    expect(communityStyles).toMatch(/\.community-chat-open \.content-panel-community,[\s\S]*?\.community-chat-open \.section-host,[\s\S]*?\.community-chat-open \.community-chat-shell\s*\{[^}]*height:\s*100%;[^}]*margin:\s*0;[^}]*padding:\s*0;/s);
    expect(communityStyles).toMatch(/padding:\s*8px max\(2px, var\(--club-safe-right\)\) max\(8px, var\(--club-safe-bottom\)\)/s);
  });

  it("uses a visible light-theme emoji and moderator message pins", () => {
    expect(communityStyles).toMatch(/:root\[data-theme="light"\] \.community-chat-open \.composer-emoji-wrap \.icon-button\s*\{[^}]*color:\s*var\(--color-primary-strong\) !important;/s);
    expect(sectionSource).toContain("setClubMessagePinned");
    expect(roomSource).toContain('class="chat-pinned-bar"');
    expect(moderationSource).toContain('message.pinnedAt ? "Открепить сообщение" : "Закрепить сообщение"');
    expect(roomSource).toContain("pinnedMessages.length");
    expect(roomSource).toContain("formatMessageTime(message.createdAt)");
    expect(sectionSource).toContain("Можно закрепить не больше 5 сообщений.");
    expect(sectionSource).toContain('notifications.showInfo("Можно закрепить не больше 5 сообщений.")');
    expect(sectionSource).not.toContain('window.alert("Можно закрепить не больше 5 сообщений.")');
  });

  it("keeps pinned messages in an accessible collapsible panel", () => {
    expect(roomSource).toContain(':aria-expanded="showPinnedMessages"');
    expect(roomSource).toContain('aria-controls="chat-pinned-details"');
    expect(roomSource).toContain('id="chat-pinned-details"');
    expect(roomSource).toMatch(/v-if="showPinnedMessages"[^>]*id="chat-pinned-details"[^>]*class="chat-pinned-details"/s);
    expect(roomSource).toContain('class="chat-pinned-toggle"');
    expect(roomSource).toContain('class="chat-pinned-toggle-icon h-4 w-4"');
    expect(communityStyles).toMatch(/\.community-chat-open \.chat-pinned-toggle\s*\{[^}]*min-height:\s*44px;/s);
    expect(communityStyles).toMatch(/\.community-chat-open \.chat-pinned-details\s*\{[^}]*position:\s*absolute;[^}]*max-height:\s*min\(50dvh, 28rem\);/s);
  });

  it("uses one touch-friendly moderation action sheet instead of inline buttons", () => {
    expect(moderationSource).toContain('class="moderation-action-sheet-backdrop"');
    expect(moderationSource).toContain('class="moderation-action-sheet"');
    expect(moderationSource).toContain('role="dialog"');
    expect(moderationSource).not.toContain('class="moderation-menu"');
    expect(communityStyles).toMatch(/\.moderation-action-row\s*\{[^}]*min-height:\s*48px;/s);
  });

  it("uses the themed in-app confirmation before deleting every topic message", () => {
    const deleteAllHandler = sectionSource.match(/function handleDeleteTopicMessages\(\)[\s\S]*?(?=function cancelDeleteTopicMessages)/)?.[0] ?? "";

    expect(sectionSource).toContain('import ConfirmDialog from "@/features/app/ConfirmDialog.vue"');
    expect(sectionSource).toContain("showDeleteTopicMessagesConfirm");
    expect(sectionSource).toContain("deleteTopicMessagesBusy");
    expect(sectionSource).toContain("<ConfirmDialog");
    expect(sectionSource).toContain('confirm-label="Удалить всё"');
    expect(sectionSource).toContain(":danger=\"true\"");
    expect(sectionSource).toContain(":busy=\"deleteTopicMessagesBusy\"");
    expect(deleteAllHandler).toContain("showDeleteTopicMessagesConfirm.value = true");
    expect(deleteAllHandler).not.toContain("window.confirm");
  });

  it("highlights the exact message reached from the pinned list", () => {
    expect(roomSource).toContain("highlightedMessageId");
    expect(messageSource).toContain("chat-message-jump-highlight");
    expect(roomSource).toContain("highlightedMessageId.value = messageId");
    expect(roomSource).toContain("1_800");
    expect(communityStyles).toContain(".chat-message-jump-highlight .chat-bubble");
  });

  it("removes the generic mobile shell padding while chat is open", () => {
    expect(communityStyles).toMatch(
      /body\.club-mobile-device \.app-root\.community-chat-open:not\(\.app-root-no-user\)\s*\{[^}]*--nav-space:\s*0;[^}]*padding-bottom:\s*0;/s
    );
    expect(communityStyles).toMatch(
      /body\.club-mobile-device \.app-root\.community-chat-open:not\(\.app-root-no-user\) \.app-shell\s*\{[^}]*padding:\s*0;/s
    );
    expect(communityStyles).toMatch(
      /body\.club-mobile-device \.app-root\.community-chat-open:not\(\.app-root-no-user\) \.content-panel\s*\{[^}]*padding:\s*0;/s
    );
  });

  it("anchors the open chat to the iOS visual viewport while the keyboard is visible", () => {
    expect(communityStyles).toMatch(
      /body\.club-keyboard-open \.app-root\.community-chat-open\s*\{[^}]*top:\s*var\(--club-visible-viewport-top, 0px\);[^}]*height:\s*min\(var\(--club-visible-viewport-height, 100dvh\), 100dvh\);/s
    );
    expect(communityStyles).toMatch(
      /html\.club-keyboard-open:has\(\.app-root\.community-chat-open\),[\s\S]*body\.club-text-field-focused:has\(\.app-root\.community-chat-open\)\s*\{[^}]*overflow:\s*hidden;/s
    );
    expect(communityStyles).toMatch(
      /body\.club-ios:has\(\.community-chat-open \.chat-compose \.text-input:focus\) \.app-root\.community-chat-open\s*\{[^}]*height:\s*min\(var\(--club-visible-viewport-height, 100dvh\), 100dvh\);/s
    );
    expect(communityStyles).toMatch(
      /body\.club-ios:has\(\.community-chat-open \.chat-compose \.text-input:focus\) \.community-chat-open \.chat-compose\s*\{[^}]*padding-bottom:\s*8px;/s
    );
  });

  it("paints the iPhone home-indicator canvas with the active app theme", () => {
    expect(styles).toMatch(/html,\s*body,\s*#app\s*\{[^}]*background:\s*var\(--bg\);/s);
    expect(communityStyles).toMatch(
      /html\.club-community-locked,\s*body\.club-community-locked,\s*html\.club-community-locked #app\s*\{[^}]*background:\s*var\(--bg\);/s
    );
    expect(communityStyles).toMatch(
      /html\.club-community-locked,\s*body\.club-community-locked,\s*html\.club-community-locked #app\s*\{[^}]*height:\s*100%;[^}]*overflow:\s*hidden;/s
    );
    expect(communityStyles).toMatch(
      /\.app-root\.community-chat-open\s*\{[^}]*inset:\s*0;[^}]*height:\s*auto;/s
    );
  });
});
