import { cleanup, render, screen } from "@testing-library/vue";
import { createPinia } from "pinia";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App.vue";

const appSource = readFileSync(resolve(__dirname, "App.vue"), "utf-8");

describe("App", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the app shell", () => {
    render(App, {
      global: {
        plugins: [createPinia()]
      }
    });

    expect(screen.getByRole("button", { name: "Профиль" })).toBeTruthy();
  });

  it("resets window scroll when changing sections", async () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);

    render(App, {
      global: {
        plugins: [createPinia()]
      }
    });

    await screen.getByRole("button", { name: "Модули" }).click();

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "auto" });
  });

  it("moves from admin to profile when owner previews member modes", () => {
    expect(appSource).toContain("handlePreviewModeChange");
    expect(appSource).toContain('mode === "member-active" || mode === "member-inactive"');
    expect(appSource).toContain('void selectSection("profile");');
    expect(appSource).toContain("@preview-mode-change=\"handlePreviewModeChange\"");
  });

  it("hides member-only sections when access is inactive", () => {
    expect(appSource).toContain("isSectionAvailable");
    expect(appSource).toContain("item.memberOnly");
    expect(appSource).toContain('session.user.membershipStatus !== "active"');
    expect(appSource).toContain('activeSection.value = "profile";');
  });

  it("shows a red mail marker on profile nav when app notifications are unread", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

    expect(appSource).toContain("Mail");
    expect(appSource).toContain("notifications.unreadCount > 0");
    expect(appSource).toContain("bottom-nav-mail-badge");
    expect(styles).toContain(".bottom-nav-mail-badge");
    expect(styles).toContain("var(--danger-strong)");
  });
});
