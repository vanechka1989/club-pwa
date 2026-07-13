import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getAdminClientAccessState,
  getAdminClientDisplayName,
  getAccessSaveButtonText,
  getAdminSubscriptionActorLabel,
  getAdminSubscriptionSourceLabel,
  getAdminSubscriptionTitle,
  getAdminTariffLabel
} from "./adminClientCard";

describe("admin client card helpers", () => {
  it("uses the nickname configured in profile before the legacy first name", () => {
    expect(getAdminClientDisplayName({ displayName: "Иван", firstName: "vanechka1989", username: "vanechka1989" })).toBe("Иван");
  });

  it("shows explicit open and closed access states", () => {
    expect(getAdminClientAccessState({ membershipStatus: "active", hasRestrictions: false })).toEqual({ label: "Доступ открыт", tone: "open" });
    expect(getAdminClientAccessState({ membershipStatus: "inactive", hasRestrictions: false })).toEqual({ label: "Доступ закрыт", tone: "closed" });
    expect(getAdminClientAccessState({ membershipStatus: "active", hasRestrictions: true })).toEqual({ label: "Доступ ограничен", tone: "restricted" });
  });

  it("shows the last login in the compact client card header", () => {
    const source = readFileSync(resolve(__dirname, "AdminSection.vue"), "utf8");

    expect(source).toContain("Последний вход:");
    expect(source).toContain("selectedUser.lastLoginAt");
  });

  it("keeps bot status out of the PWA client card header", () => {
    const source = readFileSync(resolve(__dirname, "AdminSection.vue"), "utf8");

    expect(source).toContain("admin-client-title-row");
    expect(source).toContain("admin-client-card-head");
    expect(source).not.toContain("Бот {{");
    expect(source).not.toContain("getTelegramBotStatusLabel");
    expect(source).not.toContain("admin-contact-health");
  });

  it("keeps bot status out of the PWA client list", () => {
    const source = readFileSync(resolve(__dirname, "AdminSection.vue"), "utf8");

    expect(source).not.toContain("getTelegramBotStatusLabel(user.telegramBotStatus)");
  });

  it("labels the custom access date as manual access", () => {
    const source = readFileSync(resolve(__dirname, "AdminSection.vue"), "utf8");

    expect(source).toContain("admin-client-action-panel");
    expect(source).toContain("Открыть доступ");
    expect(source).toContain("Закрыть доступ");
    expect(source).toContain("Ручной доступ");
    expect(source).not.toContain("<select v-model=\"accessStatus\"");
    expect(source).not.toContain("+90 дней");
  });

  it("opens a support-style inline message form inside the client task screen", () => {
    const source = readFileSync(resolve(__dirname, "AdminSection.vue"), "utf8");
    const apiSource = readFileSync(resolve(__dirname, "../../api/client.ts"), "utf8");
    const styles = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");

    expect(source).toContain("admin-message-client-button");
    expect(source).toContain("admin-client-message-inline");
    expect(source).toContain("Paperclip");
    expect(source).toContain("admin-client-file-button");
    expect(source).toContain("createAdminClientSupportTicket");
    expect(apiSource).toContain("/support/admin/users/${telegramId}/tickets");
    expect(styles).toContain(".admin-client-message-inline");
  });

  it("keeps the client task screen scrollable above the phone bottom controls", () => {
    const styles = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");

    expect(styles).toContain("padding-bottom: max(1rem, var(--club-safe-bottom))");
    expect(styles).toMatch(/body\.club-mobile-device \.admin-client-task-screen\.task-screen-route-layer\s*\{[^}]*overflow:\s*hidden;/s);
    expect(styles).toMatch(/body\.club-mobile-device \.admin-client-task-screen\.task-screen-route-layer > \.task-screen\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\);[^}]*overflow:\s*hidden;/s);
    expect(styles).toMatch(/body\.club-mobile-device \.admin-client-task-screen\.task-screen-route-layer \.task-screen-body\s*\{[^}]*overflow-y:\s*auto;[^}]*touch-action:\s*pan-y;/s);
    expect(styles).not.toMatch(/\.admin-client-task-screen\.task-screen-route-layer\s*\{[^}]*overflow-y:\s*auto;/s);
  });

  it("uses a high-contrast closed access badge", () => {
    const styles = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");

    expect(styles).toMatch(/\.admin-access-badge-closed\s*\{[^}]*border-color:[^;]*92%[^;]*;[^}]*background:[^;]*88%[^;]*;[^}]*color:\s*#fff;[^}]*box-shadow:/s);
  });

  it("loads and shows login IP history only with the dedicated permission", () => {
    const source = readFileSync(resolve(__dirname, "AdminSection.vue"), "utf8");
    const styles = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");

    expect(source).toContain('hasCurrentAdminPermission("login_ips")');
    expect(source).toContain("getAdminUserLoginIps");
    expect(source).toContain('v-if="canViewLoginIps"');
    expect(source).toContain("IP входов");
    expect(source).toContain("История IP появится после следующего входа клиента.");
    expect(styles).toMatch(/\.admin-login-ip-address\s*\{[^}]*overflow-wrap:\s*anywhere;/s);
  });

  it("removes the duplicate profile disclosure and places device history and IPs last", () => {
    const source = readFileSync(resolve(__dirname, "AdminSection.vue"), "utf8");
    const activityIndex = source.indexOf("<summary>Активность");
    const deviceIndex = source.indexOf("<summary>Устройства");
    const ipIndex = source.indexOf("<summary>IP входов");

    expect(source).not.toContain("<summary>Профиль");
    expect(source).toContain("selectedUserDevices");
    expect(deviceIndex).toBeGreaterThan(activityIndex);
    expect(ipIndex).toBeGreaterThan(deviceIndex);
  });

  it("centers four compact KPI cards directly below the identity card", () => {
    const source = readFileSync(resolve(__dirname, "AdminSection.vue"), "utf8");
    const styles = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");

    expect(source.indexOf('class="admin-client-kpi-grid"')).toBeGreaterThan(source.indexOf('class="admin-client-identity'));
    expect(styles).toMatch(/\.admin-client-kpi\s*\{[^}]*min-height:\s*56px;[^}]*justify-items:\s*center;[^}]*text-align:\s*center;/s);
  });

  it("places mute left and save right inside the access action panel", () => {
    const source = readFileSync(resolve(__dirname, "AdminSection.vue"), "utf8");
    const clientScreen = source.slice(source.indexOf('v-if="selectedUser && activePanel'), source.indexOf('v-if="clientMessageOpen"'));
    const actionForm = clientScreen.slice(clientScreen.indexOf('class="admin-compact-date-row"'), clientScreen.indexOf("</form>", clientScreen.indexOf('class="admin-compact-date-row"')));

    expect(clientScreen).not.toContain("admin-client-secondary-actions");
    expect(actionForm).toContain("handleQuickMute(selectedUser)");
    expect(actionForm.indexOf("Мут до снятия")).toBeLessThan(actionForm.indexOf("accessSaveButtonText"));
  });

  it("uses one disclosure style for subscriptions, payments, referrals, restrictions, devices and IPs", () => {
    const source = readFileSync(resolve(__dirname, "AdminSection.vue"), "utf8");
    const clientScreen = source.slice(source.indexOf('v-if="selectedUser && activePanel'), source.indexOf('v-if="clientMessageOpen"'));

    for (const label of ["Подписки", "Оплаты клиента", "Рефералы", "Ограничения и удаления", "Устройства", "IP входов"]) {
      expect(clientScreen).toContain(`<summary>${label}`);
    }
    expect(clientScreen).not.toContain("admin-crm-block ui-card admin-accordion-block");
    expect(clientScreen).not.toContain("admin-accordion-head");
  });

  it("keeps closed client disclosures as compact tap rows", () => {
    const styles = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");

    expect(styles).toMatch(/\.admin-client-workspace \.admin-client-compact-section\s*\{[^}]*gap:\s*0;[^}]*min-height:\s*0;/s);
    expect(styles).toMatch(/\.admin-client-workspace \.admin-client-compact-section > summary\s*\{[^}]*min-height:\s*44px;[^}]*padding:\s*6px 12px;/s);
    expect(styles).toMatch(/\.admin-client-workspace\s*\{[^}]*gap:\s*8px;/s);
  });

  it("shows clear labels for manual access changes", () => {
    const manualGrant = {
      status: "active",
      provider: "manual",
      providerPaymentId: "admin:593677751:2026-06-26T00:20:00.000Z",
      changedBy: "Ivan"
    } as const;

    expect(getAdminSubscriptionTitle(manualGrant)).toBe("Доступ выдан вручную");
    expect(getAdminSubscriptionSourceLabel(manualGrant)).toBe("Ручное управление доступом");
    expect(getAdminSubscriptionActorLabel(manualGrant)).toBe("Кто изменил: Ivan");
  });

  it("shows clear labels for revoked manual access", () => {
    const manualRevoke = {
      status: "inactive",
      provider: "manual",
      providerPaymentId: "manual"
    } as const;

    expect(getAdminSubscriptionTitle(manualRevoke)).toBe("Доступ забран вручную");
    expect(getAdminSubscriptionActorLabel(manualRevoke)).toBe("Кто изменил: не сохранено");
  });

  it("shows clear labels for Prodamus payments", () => {
    expect(
      getAdminSubscriptionTitle({
        status: "active",
        provider: "prodamus_recurrent",
        providerPaymentId: "46102525"
      })
    ).toBe("Оплачена автоподписка");
    expect(
      getAdminSubscriptionSourceLabel({
        status: "active",
        provider: "prodamus",
        providerPaymentId: "46102524"
      })
    ).toBe("Разовая оплата Prodamus");
  });

  it("switches save button text after a successful save", () => {
    expect(getAccessSaveButtonText(false)).toBe("Сохранить");
    expect(getAccessSaveButtonText(true)).toBe("Сохранено");
  });

  it("shows readable tariff labels in client filters and cards", () => {
    expect(getAdminTariffLabel("manual")).toBe("Ручной доступ");
    expect(getAdminTariffLabel("prodamus")).toBe("Разовый платёж");
    expect(getAdminTariffLabel("prodamus_recurrent")).toBe("Автоподписка");
    expect(getAdminTariffLabel("future")).toBe("Без тарифа");
    expect(getAdminTariffLabel(null)).toBe("Без тарифа");
  });
});
