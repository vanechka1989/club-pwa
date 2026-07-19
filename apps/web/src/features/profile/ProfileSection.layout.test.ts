import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "ProfileSection.vue"), "utf8");
const styles = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");

describe("compact profile layout", () => {
  it("uses one dashboard hero and compact summary navigation", () => {
    expect(source).toContain("profile-dashboard");
    expect(source).toContain('class="profile-summary-grid"');
    expect(source.match(/class="profile-nav-row/g)).toHaveLength(2);
    expect(source).not.toContain('class="section-head ui-page-header"');
  });

  it("keeps a compact page header outside the identity card", () => {
    expect(source).toContain('<UiPageHeader class="profile-page-header" title="Профиль" subtitle="Аккаунт и доступ.">');
    expect(source).toContain('<template #actions>');
    expect(source).toContain('class="compact-controls profile-page-header-controls"');
    expect(source).not.toContain("profile-dashboard-controls");
  });

  it("keeps the language and notification controls separate without an outer capsule", () => {
    expect(styles).toMatch(
      /\.profile-page-header-controls\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*padding:\s*0;[^}]*box-shadow:\s*none;/s
    );
  });

  it("defines deterministic mobile layout hooks", () => {
    for (const selector of [".profile-dashboard {", ".profile-dashboard-hero {", ".profile-summary-grid {", ".profile-nav-row {"]) {
      expect(styles).toContain(selector);
    }
    expect(styles).toContain("grid-template-columns: repeat(2, minmax(0, 1fr));");
  });

  it("uses scalable rem typography below the header like the modules section", () => {
    expect(styles).toMatch(/\.profile-summary-card-head\s*\{[^}]*font-size:\s*0\.75rem;/s);
    expect(styles).toMatch(/\.profile-nav-copy strong\s*\{[^}]*font-size:\s*0\.9375rem;/s);
    expect(styles).toMatch(/\.profile-nav-copy small\s*\{[^}]*font-size:\s*0\.75rem;/s);
    expect(styles).toMatch(/\.profile-dashboard-subscription-meta\s*\{[^}]*font-size:\s*0\.75rem;/s);
  });

  it("keeps all secondary profile capabilities reachable", () => {
    for (const panel of ["referrals", "appearance"]) {
      expect(source).toContain(`openProfilePanel("${panel}")`);
    }
    expect(source).toContain("copyReferralLink");
    expect(source).toContain("ui.setDesignTheme(option.value)");
    expect(source).toContain("showLogoutConfirm = true");
  });

  it("keeps logout on the profile page without a redundant account screen", () => {
    expect(source).toContain('class="profile-dashboard-logout ');
    expect(source).not.toContain('openProfilePanel("account")');
    expect(source).not.toContain('activeProfilePanel === "account"');
    expect(source).not.toContain("Аккаунт и безопасность");
  });

  it("stretches and visually emphasizes the logout action", () => {
    expect(styles).toContain(".profile-dashboard .profile-dashboard-logout {");
    expect(styles).toMatch(/\.profile-dashboard \.profile-dashboard-logout\s*\{[^}]*width:\s*100%;/s);
    expect(styles).toMatch(/\.profile-dashboard \.profile-dashboard-logout\s*\{[^}]*justify-self:\s*stretch;/s);
    expect(styles).toContain("background: var(--danger-soft);");
    expect(styles).toContain("color: var(--danger-text);");
  });

  it("does not spend profile space on the user role badge", () => {
    expect(source).not.toContain("profile-role-pill");
    expect(source).not.toContain("roleLabel");
  });

  it("uses one compact avatar action instead of two exposed controls", () => {
    expect(source).toContain('class="profile-avatar-menu-button profile-avatar-icon-button ui-icon-button"');
    expect(source).toContain("avatarPhotoMenuOpen");
    expect(source).toContain("Загрузить новое фото");
    expect(source).toContain("Настроить кадр");
    expect(source).not.toContain('class="profile-avatar-actions"');
  });

  it("keeps the camera badge compact without shrinking its touch target", () => {
    expect(styles).toContain("--profile-avatar-camera-visual-size: calc(26px * var(--club-scaled-control-factor, 1));");
    expect(styles).toMatch(/\.profile-dashboard \.profile-avatar-menu-button::before\s*\{[^}]*width:\s*var\(--profile-avatar-camera-visual-size\);[^}]*height:\s*var\(--profile-avatar-camera-visual-size\);/s);
    expect(styles).toMatch(/\.profile-dashboard \.profile-avatar-menu-button\s*\{[^}]*width:\s*var\(--icon-button-size\);/s);
  });

  it("uses a compact crop workspace and one-row actions", () => {
    expect(source).toContain("profile-avatar-editor-zoom");
    expect(source).toContain("profile-avatar-editor-footer");
    expect(styles).toContain(".profile-avatar-task-screen .profile-avatar-editor-footer {");
    expect(styles).toContain("grid-template-columns: repeat(2, minmax(0, 1fr));");
  });

  it("keeps the crop task compact under mobile body overrides", () => {
    expect(styles).toContain("body.club-mobile-device .profile-avatar-task-screen .profile-avatar-editor-modal");
    expect(styles).toContain("body.club-mobile-device .profile-avatar-task-screen .profile-avatar-editor-controls");
    expect(styles).toContain("body.club-mobile-app-scaled .profile-avatar-task-screen .profile-avatar-editor-controls");
    expect(styles).toContain("height: auto;");
    expect(styles).toContain("grid-column: auto;");
  });
});
