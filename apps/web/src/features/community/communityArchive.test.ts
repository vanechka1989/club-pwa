import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "CommunitySection.vue"), "utf8");
const styles = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");
const communityStyles = readFileSync(resolve(__dirname, "community.css"), "utf8");
const foundation = readFileSync(resolve(__dirname, "../ui/foundation.css"), "utf8");
const main = readFileSync(resolve(__dirname, "../../main.ts"), "utf8");

describe("community archive labels", () => {
  it("shows when archived topics will be deleted", () => {
    expect(source).toContain("formatArchiveDeletionLabel(topic.archivedUntil)");
    expect(source).not.toContain("В архиве до {{ formatArchiveUntil");
  });

  it("uses the shared viewport measurement instead of a second chat viewport", () => {
    expect(source).not.toContain("--club-chat-viewport-height");
    expect(source).not.toContain("bindChatViewportHeight");
  });

  it("loads one canonical community stylesheet after foundation", () => {
    expect(main.indexOf('import "./features/ui/foundation.css"')).toBeLessThan(
      main.indexOf('import "./features/community/community.css"')
    );
    expect(foundation).not.toContain(".community-chat-open .chat-room");
  });

  it("does not show a chat update alert for automatic polling failures", () => {
    expect(source).toContain("void refreshSelectedTopic({ silent: true });");
  });

  it("uses the compact shared gap below the community header", () => {
    expect(source).toContain('class="community-section-content"');
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
    expect(communityStyles).toMatch(/padding:\s*8px max\(16px, var\(--club-safe-right\)\) max\(8px, var\(--club-safe-bottom\)\)/s);
  });

  it("uses a visible light-theme emoji and moderator message pins", () => {
    expect(communityStyles).toMatch(/:root\[data-theme="light"\] \.community-chat-open \.composer-emoji-wrap \.icon-button\s*\{[^}]*color:\s*var\(--color-primary-strong\) !important;/s);
    expect(source).toContain("setClubMessagePinned");
    expect(source).toContain('class="chat-pinned-bar"');
    expect(source).toContain('activeModerationMessage.pinnedAt ? "Открепить сообщение" : "Закрепить сообщение"');
    expect(source).toContain("pinnedMessages.length");
    expect(source).toContain("formatMessageTime(message.createdAt)");
    expect(source).toContain("Можно закрепить не больше 5 сообщений.");
  });

  it("uses one touch-friendly moderation action sheet instead of inline buttons", () => {
    expect(source).toContain('class="moderation-action-sheet-backdrop"');
    expect(source).toContain('class="moderation-action-sheet"');
    expect(source).toContain('role="dialog"');
    expect(source).not.toContain('class="moderation-menu"');
    expect(communityStyles).toMatch(/\.moderation-action-row\s*\{[^}]*min-height:\s*48px;/s);
  });
});
