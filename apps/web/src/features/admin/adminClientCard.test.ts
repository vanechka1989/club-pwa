import { describe, expect, it } from "vitest";
import {
  getAccessSaveButtonText,
  getAdminSubscriptionActorLabel,
  getAdminSubscriptionSourceLabel,
  getAdminSubscriptionTitle,
  getAdminTariffLabel
} from "./adminClientCard";

describe("admin client card helpers", () => {
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
