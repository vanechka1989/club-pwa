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

  it("aligns referral and appearance screens with the main profile gutters", () => {
    expect(source.match(/class="profile-detail-task-screen"/g)).toHaveLength(2);
    expect(styles).toMatch(/\.profile-detail-task-screen \.task-screen-header\s*\{[^}]*margin:\s*12px 14px 0;[^}]*border-radius:\s*18px;/s);
    expect(styles).toMatch(/\.profile-detail-task-screen \.task-screen-body\s*\{[^}]*padding:\s*12px 14px/s);
    expect(styles).toMatch(/\.profile-detail-task-screen \.task-screen-body > :first-child\s*\{[^}]*width:\s*100%;[^}]*margin-inline:\s*0;/s);
  });

  it("keeps referral content readable across narrow profile screens", () => {
    expect(styles).toMatch(/\.profile-detail-task-screen \.profile-referral-link span\s*\{[^}]*overflow-wrap:\s*anywhere;[^}]*text-overflow:\s*clip;[^}]*white-space:\s*normal;/s);
    expect(styles).toMatch(/\.profile-detail-task-screen \.profile-referral-stats span\s*\{[^}]*overflow:\s*visible;[^}]*white-space:\s*normal;/s);
    expect(styles).toMatch(/\.profile-detail-task-screen \.profile-referral-link button\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;/s);
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

  it("opens the same photo action from the avatar and camera beside the name editor", () => {
    expect(source).toContain('class="profile-avatar profile-avatar-large profile-avatar-trigger"');
    expect(source.match(/@click="openAvatarPhotoActions"/g)).toHaveLength(2);
    expect(source).toMatch(/profile-display-name-row[\s\S]*profile-avatar-icon-button/);
    expect(source).toContain("avatarPhotoMenuOpen");
    expect(source).toContain("Загрузить новое фото");
    expect(source).toContain("Настроить кадр");
    expect(source).not.toContain("profile-avatar-menu-button");
    expect(source).not.toContain('class="profile-avatar-actions"');
  });

  it("keeps file selection inside the visible photo menu action", () => {
    expect(source).not.toContain('ref="avatarUploadInput"');
    expect(source).toMatch(/profile-photo-menu-action[\s\S]*class="profile-upload-input"/);
    expect(styles).not.toContain(".profile-upload-input-detached");
  });

  it("keeps a selected avatar as a local draft until save", () => {
    expect(source).toContain("const avatarDraftFile = ref<File | null>(null)");
    expect(source).toContain("const avatarDraftUrl = ref<string | null>(null)");
    expect(source).toContain("const avatarEditorPreviewUrl = computed");
    expect(source).toContain("URL.createObjectURL(file)");
    expect(source.match(/session\.uploadAvatar\(/g)).toHaveLength(1);
    expect(source).toMatch(/async function handleAvatarDisplaySave\(\)[\s\S]*session\.uploadAvatar\(avatarDraftFile\.value/);
    expect(source).not.toMatch(/async function handleAvatarUpload[\s\S]*session\.uploadAvatar\(file\)/);
  });

  it("shows the current avatar in the photo menu and the active draft in the crop editor", () => {
    expect(source).toContain('class="profile-photo-menu-preview"');
    expect(source).toMatch(/profile-photo-menu-preview[\s\S]*session\.user\?\.photoUrl/);
    expect(source).toContain(':src="avatarEditorPreviewUrl"');
    expect(styles).toMatch(/\.profile-photo-menu\s*\{[^}]*bottom:\s*calc\(var\(--bottom-nav-height\)/s);
    expect(styles).toMatch(/\.profile-photo-menu\.ui-card\s*\{[^}]*width:\s*auto;/s);
    expect(styles).toMatch(/\.profile-photo-menu-preview\s*\{[^}]*border-radius:\s*50%;/s);
  });

  it("highlights the name editor with the same action badge as the camera", () => {
    expect(source).toContain('class="profile-name-edit profile-avatar-icon-button ui-icon-button"');
  });

  it("keeps the avatar and camera as accessible touch targets without overlay positioning", () => {
    expect(styles).toMatch(/\.profile-dashboard \.profile-avatar-trigger\s*\{[^}]*padding:\s*0;[^}]*border:\s*0;/s);
    expect(styles).toMatch(/\.profile-dashboard \.profile-display-name-row \.profile-avatar-icon-button\s*\{[^}]*width:\s*var\(--icon-button-size\);/s);
    expect(styles).toMatch(/\.profile-dashboard-toolbar \.profile-avatar-icon-button\s*\{[^}]*--action-icon-glyph-size:\s*calc\(16px \* var\(--club-scaled-control-factor, 1\)\);/s);
    expect(styles).not.toContain(".profile-dashboard .profile-avatar-menu-button");
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
