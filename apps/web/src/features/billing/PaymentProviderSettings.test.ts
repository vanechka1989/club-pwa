import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";
import PaymentProviderSettings from "./PaymentProviderSettings.vue";

describe("PaymentProviderSettings", () => {
  afterEach(cleanup);

  it("shows webhook addresses before Lava is connected", () => {
    render(PaymentProviderSettings, {
      props: {
        provider: null,
        section: "connection",
        webhookUrls: {
          payment: "https://club.example/api/payments/lava/webhook/payment",
          subscription: "https://club.example/api/payments/lava/webhook/subscription"
        }
      }
    });

    expect(screen.getByText("Не подключено")).toBeTruthy();
    expect(screen.getByText("Webhook обычной оплаты")).toBeTruthy();
    expect(screen.getByText("Webhook рекуррентной подписки")).toBeTruthy();
    expect(screen.getByDisplayValue(/webhook\/payment/)).toBeTruthy();
    expect(screen.getByDisplayValue(/webhook\/subscription/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Проверить" })).toBeNull();
  });

  it("shows verification and catalog actions only on the second step", () => {
    render(PaymentProviderSettings, {
      props: {
        section: "catalog",
        provider: {
          id: "lava",
          provider: "lava",
          title: "Lava",
          formUrl: "",
          sys: "",
          isEnabled: true,
          secretConfigured: true,
          webhookSecretConfigured: true,
          connectionState: "verified",
          lastCheckedAt: "2026-07-25T10:00:00.000Z",
          lastCheckError: null,
          webhookUrls: {
            payment: "https://club.example/api/payments/lava/webhook/payment",
            subscription: "https://club.example/api/payments/lava/webhook/subscription"
          }
        }
      }
    });

    expect(screen.getByText("Соединение проверено")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Проверить" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Обновить товары/ })).toBeTruthy();
    expect(screen.queryByDisplayValue(/webhook\/payment/)).toBeNull();
    expect(screen.queryByText("lava-secret-key")).toBeNull();
  });
});
