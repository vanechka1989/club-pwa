import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getAccessSaveButtonText,
  getAdminSubscriptionActorLabel,
  getAdminSubscriptionSourceLabel,
  getAdminSubscriptionTitle,
  getAdminTariffLabel
} from "./adminClientCard";

describe("admin client card helpers", () => {
  it("shows the last login in the compact client card header", () => {
    const source = readFileSync(resolve(__dirname, "AdminSection.vue"), "utf8");

    expect(source).toContain("Вход:");
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

  it("opens a support-style message modal from the client card", () => {
    const source = readFileSync(resolve(__dirname, "AdminSection.vue"), "utf8");
    const apiSource = readFileSync(resolve(__dirname, "../../api/client.ts"), "utf8");
    const styles = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");

    expect(source).toContain("admin-message-client-button");
    expect(source).toContain("admin-client-message-modal");
    expect(source).toContain("Paperclip");
    expect(source).toContain("admin-client-file-button");
    expect(source).toContain("createAdminClientSupportTicket");
    expect(apiSource).toContain("/support/admin/users/${telegramId}/tickets");
    expect(styles).toContain("body.club-keyboard-open .admin-client-message-layer");
    expect(styles).toContain("body.club-keyboard-open .admin-client-message-modal");
    expect(styles).toContain("body.club-keyboard-open .admin-client-message-row textarea");
    expect(styles).toContain("body.club-keyboard-open .admin-client-file-button");
  });

  it("keeps the client card scrollable above the phone bottom controls", () => {
    const styles = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");

    expect(styles).toMatch(
      /\.admin-client-modal\s*\{[^}]*padding-bottom:\s*max\(1\.35rem,\s*calc\(var\(--club-safe-bottom\) \+ 1rem\)\);/s
    );
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
