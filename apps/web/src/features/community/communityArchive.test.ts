import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "CommunitySection.vue"), "utf8");
const styles = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");

describe("community archive labels", () => {
  it("shows when archived topics will be deleted", () => {
    expect(source).toContain("formatArchiveDeletionLabel(topic.archivedUntil)");
    expect(source).not.toContain("В архиве до {{ formatArchiveUntil");
  });

  it("keeps chat viewport sizing separate from the global app viewport", () => {
    expect(source).not.toContain("--club-viewport-height");
    expect(source).toContain("--club-chat-viewport-height");
    expect(source).toContain('document.body.classList.contains("club-ios")');
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
    expect(styles).toMatch(/\.community-chat-open \.community-chat-shell,[\s\S]*?\.community-chat-open \.chat-room\s*\{[^}]*height:\s*100%;/s);
    expect(styles).toMatch(/\.community-chat-open \.chat-room\s*\{[^}]*grid-template-rows:\s*auto auto minmax\(0, 1fr\) auto;/s);
    expect(styles).toMatch(/\.community-chat-open \.chat-compose,[^}]*width:\s*100%;[^}]*max-width:\s*none;/s);
    expect(styles).toMatch(/\.community-chat-open \.chat-room-header\s*\{[^}]*width:\s*100%;/s);
  });

  it("uses a visible light-theme emoji and moderator message pins", () => {
    expect(styles).toMatch(/:root\[data-theme="light"\] \.community-chat-open \.composer-emoji-wrap \.icon-button\s*\{[^}]*color:\s*var\(--color-primary-strong\) !important;/s);
    expect(source).toContain("setClubMessagePinned");
    expect(source).toContain('class="chat-pinned-bar"');
    expect(source).toContain('message.pinnedAt ? "Открепить" : "Закрепить"');
    expect(source).toContain("pinnedMessages.length");
  });
});
