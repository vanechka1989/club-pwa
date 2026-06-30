import { cleanup, render, screen } from "@testing-library/vue";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { nextTick } from "vue";
import AppNotifications from "./AppNotifications.vue";
import { useNotificationsStore } from "@/stores/notifications";

describe("app notifications", () => {
  beforeEach(() => {
    cleanup();
    setActivePinia(createPinia());
  });

  it("renders errors and success messages in a global layer above modal backdrops", async () => {
    const pinia = createPinia();
    render(AppNotifications, {
      global: {
        plugins: [pinia]
      }
    });

    const notifications = useNotificationsStore(pinia);
    notifications.showError("Напишите сообщение для поддержки.");
    notifications.showSuccess("Обращение отправлено.");
    await nextTick();

    expect(screen.getByText("Напишите сообщение для поддержки.").closest(".app-toast-error")).toBeTruthy();
    expect(screen.getByText("Обращение отправлено.").closest(".app-toast-success")).toBeTruthy();
    expect(document.body.querySelector(".app-toast-viewport")).toBeTruthy();
  });

  it("keeps the global notification layer above support, admin, and payment modals", () => {
    const styles = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");

    expect(styles).toMatch(/\.app-toast-viewport\s*\{[^}]*z-index:\s*1000;/s);
    expect(styles).toMatch(/\.support-modal-backdrop\s*\{[^}]*z-index:\s*80;/s);
    expect(styles).toMatch(/\.admin-modal-backdrop\s*\{[^}]*z-index:\s*140;/s);
    expect(styles).toMatch(/\.payment-modal-backdrop\s*\{[^}]*z-index:\s*145;/s);
  });

  it("renders mailing HTML and inline media previews in the notification center", () => {
    const source = readFileSync(resolve(__dirname, "NotificationCenter.vue"), "utf8");
    const styles = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");

    expect(source).toContain("renderNotificationHtml");
    expect(source).toContain('v-html="renderNotificationHtml(notification)"');
    expect(source).toContain("notification-center-media");
    expect(source).toContain("notification.attachment.kind === \"photo\"");
    expect(source).toContain("notification.attachment.kind === \"video\"");
    expect(styles).toContain(".notification-center-media");
  });

  it("places the notification bell in the profile compact controls instead of the app top center", () => {
    const appSource = readFileSync(resolve(__dirname, "../../App.vue"), "utf8");
    const profileSource = readFileSync(resolve(__dirname, "../profile/ProfileSection.vue"), "utf8");
    const styles = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");

    expect(appSource).not.toContain("<NotificationCenter");
    expect(profileSource).toContain('import NotificationCenter from "@/features/app/NotificationCenter.vue";');
    expect(profileSource).toContain("<NotificationCenter");
    expect(profileSource).not.toContain("@click=\"changeTheme(ui.theme === 'dark' ? 'light' : 'dark')\"");
    expect(styles).toMatch(/\.compact-controls\s+\.notification-center\s*\{/s);
    expect(styles).toMatch(/\.compact-controls\s+\.notification-center-button\s*\{[^}]*width:\s*2rem;/s);
    expect(styles).not.toMatch(/\.notification-center\s*\{[^}]*top:\s*calc\(var\(--tg-safe-top/s);
  });
});
