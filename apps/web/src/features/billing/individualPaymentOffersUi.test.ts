import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("individual payment offer UI", () => {
  it("exposes the admin action, history and client-only payment screen", () => {
    const clients = readFileSync(resolve(__dirname, "../admin/AdminClientsPanel.vue"), "utf8");
    const adminOffer = readFileSync(resolve(__dirname, "../admin/AdminIndividualOfferCard.vue"), "utf8");
    const adminStyles = readFileSync(resolve(__dirname, "../admin/adminShell.css"), "utf8");
    const clientOffer = readFileSync(resolve(__dirname, "IndividualPaymentOfferScreen.vue"), "utf8");
    const navigation = readFileSync(resolve(__dirname, "../app/taskNavigation.ts"), "utf8");

    expect(clients).toContain("AdminIndividualOfferCard");
    expect(clients).toContain("MessageCircle");
    expect(clients).toContain("/>Написать</button><AdminIndividualOfferCard");
    expect(clients).not.toContain("Написать клиенту");
    expect(adminOffer).toContain("Подписка</button>");
    expect(adminOffer).not.toContain("Выдать подписку");
    expect(adminOffer).toContain(".individual-offer-entry{min-width:0;width:100%}");
    expect(adminOffer).toContain(".individual-offer-button{width:100%");
    expect(adminOffer).toMatch(/\.individual-offer-button\{[^}]*--individual-offer-color:\s*#8b5cf6/s);
    expect(adminStyles).toMatch(/\.admin-client-primary-actions\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);[^}]*gap:\s*8px;/s);
    expect(adminStyles).toMatch(/\.admin-client-primary-actions \.admin-message-client-button\s*\{[^}]*width:\s*100%;[^}]*min-height:\s*52px;/s);
    expect(adminOffer).toContain("Созданные ссылки");
    expect(adminOffer).toContain("Ссылка действует 24 часа");
    expect(clientOffer).toContain("привязана к вашему аккаунту");
    expect(clientOffer).toContain("watch(() => props.token, load, { immediate: true })");
    expect(navigation).toContain('"/payments/offers/:token"');
  });
});
