import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const foundation = readFileSync(resolve(__dirname, "../ui/foundation.css"), "utf8");
const styles = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");
const community = readFileSync(resolve(__dirname, "../community/community.css"), "utf8");
const communitySource = readFileSync(resolve(__dirname, "../community/CommunitySection.vue"), "utf8");

describe("application page header consistency", () => {
  it("uses the profile header typography as the shared application header contract", () => {
    expect(foundation).toContain("--app-header-title-size: 20px;");
    expect(foundation).toContain("--app-header-subtitle-size: 12px;");
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

  it("uses the same semantic title and subtitle classes in the full-screen chat header", () => {
    expect(communitySource).toContain('class="chat-room-header-title"');
    expect(communitySource).toContain('class="chat-room-header-subtitle"');
    expect(community).toMatch(/\.community-chat-open \.chat-room-header-title\s*\{[^}]*font-size:\s*var\(--app-header-title-size\);/s);
    expect(community).toMatch(/\.community-chat-open \.chat-room-header-subtitle\s*\{[^}]*font-size:\s*var\(--app-header-subtitle-size\);/s);
  });
});
