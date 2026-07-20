import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const foundation = readFileSync(resolve(__dirname, "../ui/foundation.css"), "utf8");
const styles = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");
const community = readFileSync(resolve(__dirname, "../community/community.css"), "utf8");
const communitySource = readFileSync(resolve(__dirname, "../community/CommunitySection.vue"), "utf8");

describe("application page header consistency", () => {
  it("uses the profile header typography as the shared application header contract", () => {
    expect(foundation).toContain("--app-header-title-size: var(--club-user-header-title-size, 20px);");
    expect(foundation).toContain("--app-header-subtitle-size: var(--club-user-header-subtitle-size, 12px);");
    expect(foundation).toContain("--app-header-title-line-height: 1.2;");
    expect(foundation).toContain("--app-header-subtitle-line-height: 1.35;");

    expect(foundation).toMatch(/\.ui-page-header__title\s*\{[^}]*font-size:\s*var\(--app-header-title-size\);/s);
    expect(foundation).toMatch(/\.ui-page-header__subtitle\s*\{[^}]*font-size:\s*var\(--app-header-subtitle-size\);/s);
    expect(styles).toMatch(/\.section-head\.ui-page-header \.section-title\s*\{[^}]*font-size:\s*var\(--app-header-title-size\);/s);
    expect(styles).toMatch(/\.section-head\.ui-page-header \.section-subtitle\s*\{[^}]*font-size:\s*var\(--app-header-subtitle-size\);/s);
  });

  it("does not let the profile or routed screens redefine header font sizes", () => {
    expect(styles).not.toMatch(/\.profile-page-header \.section-title\s*\{[^}]*font-size:/s);
    expect(styles).not.toMatch(/\.profile-page-header \.section-subtitle\s*\{[^}]*font-size:/s);
    expect(styles).not.toMatch(/\.profile-avatar-task-screen \.task-screen-heading h2\s*\{[^}]*font-size:/s);
  });

  it("uses one inset card contract for every routed task header and body", () => {
    expect(styles).toMatch(/\.task-screen-route-layer \.task-screen-header\s*\{[^}]*box-sizing:\s*border-box;[^}]*width:\s*auto;[^}]*margin:\s*12px 14px 0;[^}]*border:\s*1px solid var\(--color-border\);[^}]*border-radius:\s*var\(--card-radius\);[^}]*background:\s*var\(--color-surface\);[^}]*box-shadow:\s*var\(--shadow-sm\);/s);
    expect(styles).toMatch(/\.task-screen-route-layer \.task-screen-body\s*\{[^}]*padding:\s*12px 14px calc\(24px \+ var\(--club-safe-bottom\)\);/s);
    expect(styles).not.toContain(".profile-detail-task-screen .task-screen-header");
    expect(styles).not.toContain(".profile-detail-task-screen .task-screen-body {");
    expect(styles).toMatch(/@media \(max-width:\s*360px\)[\s\S]*?\.task-screen-route-layer \.task-screen-header\s*\{[^}]*border-radius:\s*var\(--card-radius-compact\);/s);
    expect(styles).toMatch(/\.support-create-task-screen \.task-screen-body\s*\{[^}]*padding-inline:\s*max\(14px, calc\(var\(--club-safe-left\) \+ 14px\)\) max\(14px, calc\(var\(--club-safe-right\) \+ 14px\)\);/s);
  });

  it("aligns the full-screen chat header and message content to the same gutters", () => {
    expect(community).toMatch(/\.community-chat-open \.chat-room-header\s*\{[^}]*box-sizing:\s*border-box;[^}]*width:\s*auto;[^}]*margin:\s*12px 14px 0;[^}]*border:\s*1px solid var\(--color-border\);[^}]*border-radius:\s*var\(--card-radius\);[^}]*background:\s*var\(--color-surface\);[^}]*box-shadow:\s*var\(--shadow-sm\);/s);
    expect(community).toMatch(/\.community-chat-open :is\(\.chat-room-notices, \.chat-messages\)\s*\{[^}]*padding-right:\s*max\(14px, calc\(var\(--club-safe-right\) \+ 14px\)\);[^}]*padding-left:\s*max\(14px, calc\(var\(--club-safe-left\) \+ 14px\)\);/s);
    expect(community).toMatch(/\.community-chat-open \.chat-room-header-title\s*\{[^}]*color:\s*var\(--color-text\);/s);
    expect(community).toMatch(/\.community-chat-open \.chat-room-header-subtitle\s*\{[^}]*color:\s*var\(--color-text-muted\);/s);
    expect(community).toMatch(/@media \(max-width:\s*360px\)[\s\S]*?\.community-chat-open \.chat-room-header\s*\{[^}]*border-radius:\s*var\(--card-radius-compact\);/s);
  });

  it("uses the same semantic title and subtitle classes in the full-screen chat header", () => {
    expect(communitySource).toContain('class="chat-room-header-title"');
    expect(communitySource).toContain('class="chat-room-header-subtitle"');
    expect(community).toMatch(/\.community-chat-open \.chat-room-header-title\s*\{[^}]*font-size:\s*var\(--app-header-title-size\);/s);
    expect(community).toMatch(/\.community-chat-open \.chat-room-header-subtitle\s*\{[^}]*font-size:\s*var\(--app-header-subtitle-size\);/s);
  });
});
