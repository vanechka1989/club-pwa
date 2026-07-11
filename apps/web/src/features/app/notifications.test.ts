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
    const screenSource = readFileSync(resolve(__dirname, "NotificationCenterScreen.vue"), "utf8");
    const styles = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");

    expect(screenSource).toContain("renderNotificationHtml");
    expect(screenSource).toContain('v-html="renderNotificationHtml(notification)"');
    expect(screenSource).toContain("notification-center-media");
    expect(screenSource).toContain("notification.attachment.kind === \"photo\"");
    expect(screenSource).toContain("notification.attachment.kind === \"video\"");
    expect(styles).toContain(".notification-center-media");
  });

  it("allows clearing all app notifications from the notification center", () => {
    const source = readFileSync(resolve(__dirname, "NotificationCenter.vue"), "utf8");
    const screenSource = readFileSync(resolve(__dirname, "NotificationCenterScreen.vue"), "utf8");
    const storeSource = readFileSync(resolve(__dirname, "../../stores/notifications.ts"), "utf8");
    const clientSource = readFileSync(resolve(__dirname, "../../api/client.ts"), "utf8");

    expect(source).toContain('router.push("/notifications")');
    expect(screenSource).toContain("clearAppNotificationsInApp");
    expect(screenSource).toContain("notificationsClear");
    expect(screenSource).toContain("<TaskScreen");
    expect(screenSource).not.toContain("notification-center-backdrop");
    expect(storeSource).toContain("clearAppNotifications");
    expect(clientSource).toContain('"/notifications"');
    expect(clientSource).toContain('method: "DELETE"');
  });

  it("keeps the notification header compact across two rows", () => {
    const foundation = readFileSync(resolve(__dirname, "../ui/foundation.css"), "utf8");

    expect(foundation).toMatch(/\.notification-task-screen \.task-screen-header\s*\{[^}]*grid-template-columns:\s*44px minmax\(0, 1fr\) auto;/s);
    expect(foundation).toMatch(/\.notification-task-screen \.ui-page-header__text\s*\{[^}]*display:\s*contents;/s);
    expect(foundation).toMatch(/\.notification-task-screen \.ui-page-header__title\s*\{[^}]*grid-column:\s*2 \/ -1;[^}]*white-space:\s*nowrap;/s);
    expect(foundation).toMatch(/\.notification-task-screen \.ui-page-header__subtitle\s*\{[^}]*grid-column:\s*2;[^}]*grid-row:\s*2;/s);
    expect(foundation).toMatch(/\.notification-task-screen \.ui-page-header__actions\s*\{[^}]*grid-column:\s*3;[^}]*grid-row:\s*2;[^}]*width:\s*auto;/s);
    expect(foundation).toMatch(/\.notification-task-screen \.task-screen-actions\s*\{[^}]*flex-wrap:\s*nowrap;/s);
    expect(foundation).toMatch(/@media \(max-width:\s*359px\)[\s\S]*?\.notification-task-screen \.ui-page-header__title,[\s\S]*?\.notification-task-screen \.ui-page-header__actions\s*\{[^}]*grid-column:\s*2;/s);
    expect(foundation).toMatch(/@media \(max-width:\s*359px\)[\s\S]*?\.notification-task-screen \.ui-page-header__actions\s*\{[^}]*grid-row:\s*3;/s);
  });

  it("exposes a delete endpoint for clearing stored notifications", () => {
    const routeSource = readFileSync(resolve(__dirname, "../../../../api/src/routes/notifications.ts"), "utf8");

    expect(routeSource).toContain('.delete("/", async (c) =>');
    expect(routeSource).toContain("db.delete(appNotifications)");
    expect(routeSource).toContain("unreadCount: 0");
  });

  it("places the notification bell in the profile compact controls instead of the app top center", () => {
    const appSource = readFileSync(resolve(__dirname, "../../App.vue"), "utf8");
    const profileSource = readFileSync(resolve(__dirname, "../profile/ProfileSection.vue"), "utf8");
    const styles = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");

    expect(appSource).not.toMatch(/<NotificationCenter(?:\s|\/|>)/);
    expect(profileSource).toContain('import NotificationCenter from "@/features/app/NotificationCenter.vue";');
    expect(profileSource).toContain("<NotificationCenter");
    expect(profileSource).not.toContain("@click=\"changeTheme(ui.theme === 'dark' ? 'light' : 'dark')\"");
    expect(styles).toMatch(/\.compact-controls\s+\.notification-center\s*\{/s);
    expect(styles).toMatch(/\.compact-controls\s+\.notification-center-button\s*\{[^}]*width:\s*var\(--icon-button-size\);/s);
    expect(styles).not.toMatch(/\.notification-center\s*\{[^}]*top:\s*calc\(var\(--tg-safe-top/s);
  });
});
