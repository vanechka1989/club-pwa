import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getAccessSaveButtonText,
  getAdminSubscriptionActorLabel,
  getAdminSubscriptionSourceLabel,
  getAdminSubscriptionTitle,
  getAdminTariffLabel,
  getTelegramBotStatusHint,
  getTelegramBotStatusLabel,
  getTelegramBotStatusTitle
} from "./adminClientCard";

describe("admin client card helpers", () => {
  it("shows the last login in the client card header stats", () => {
    const source = readFileSync(resolve(__dirname, "AdminSection.vue"), "utf8");

    expect(source).toContain("Последний вход:");
    expect(source).toContain("selectedUser.lastLoginAt");
  });

  it("shows the Telegram bot status in the client card header stats", () => {
    const source = readFileSync(resolve(__dirname, "AdminSection.vue"), "utf8");

    expect(source).toContain("admin-client-title-row");
    expect(source).toContain("selectedUser.telegramBotStatus");
    expect(source).not.toContain("admin-contact-health");
  });

  it("shows the Telegram bot status in the client list", () => {
    const source = readFileSync(resolve(__dirname, "AdminSection.vue"), "utf8");

    expect(source).toContain("getTelegramBotStatusLabel(user.telegramBotStatus)");
  });

  it("labels the custom access date as manual access", () => {
    const source = readFileSync(resolve(__dirname, "AdminSection.vue"), "utf8");

    expect(source).toContain("Ручной доступ");
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

  it("shows readable Telegram bot status labels", () => {
    expect(getTelegramBotStatusLabel("active")).toBe("активен");
    expect(getTelegramBotStatusLabel("blocked")).toBe("заблокирован");
    expect(getTelegramBotStatusLabel("unknown")).toBe("неизвестно");
  });

  it("shows actionable Telegram bot status copy", () => {
    expect(getTelegramBotStatusTitle("active")).toBe("Связь через бота доступна");
    expect(getTelegramBotStatusTitle("blocked")).toBe("Клиент заблокировал бота");
    expect(getTelegramBotStatusTitle("unknown")).toBe("Статус бота неизвестен");
    expect(getTelegramBotStatusHint("blocked")).toBe("Сообщения из админки не дойдут, пока клиент не запустит бота снова.");
  });
});
