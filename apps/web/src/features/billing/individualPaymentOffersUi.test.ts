import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("individual payment offer UI", () => {
  it("exposes the admin action, history and client-only payment screen", () => {
    const clients = readFileSync(resolve(__dirname, "../admin/AdminClientsPanel.vue"), "utf8");
    const adminOffer = readFileSync(resolve(__dirname, "../admin/AdminIndividualOfferCard.vue"), "utf8");
    const clientOffer = readFileSync(resolve(__dirname, "IndividualPaymentOfferScreen.vue"), "utf8");
    const navigation = readFileSync(resolve(__dirname, "../app/taskNavigation.ts"), "utf8");

    expect(clients).toContain("AdminIndividualOfferCard");
    expect(adminOffer).toContain("Выдать подписку");
    expect(adminOffer).toContain("Созданные ссылки");
    expect(adminOffer).toContain("Ссылка действует 24 часа");
    expect(clientOffer).toContain("привязана к вашему аккаунту");
    expect(clientOffer).toContain("watch(() => props.token, load, { immediate: true })");
    expect(navigation).toContain('"/payments/offers/:token"');
  });
});
