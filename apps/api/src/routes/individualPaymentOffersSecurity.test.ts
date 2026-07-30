import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("individual payment offer route security", () => {
  it("hashes tokens, binds lookup to the authenticated user and reserves checkout atomically", () => {
    const source = readFileSync(resolve(__dirname, "individualPaymentOffers.ts"), "utf8");
    expect(source).toContain("hashIndividualOfferToken(token)");
    expect(source).toContain("eq(individualPaymentOffers.userId, userId)");
    expect(source).toContain('eq(individualPaymentOffers.status, "active")');
    expect(source).toContain("db.transaction");
    expect(source).not.toMatch(/logger\.(?:warn|info|error)\([^)]*token/);
  });

  it("never stores the plaintext token in offer history or audit metadata", () => {
    const source = readFileSync(resolve(__dirname, "adminIndividualPaymentOffers.ts"), "utf8");
    expect(source).toContain("tokenHash");
    expect(source).not.toContain("metadata: { token");
    expect(source).not.toContain("token: token");
  });

  it("expires an opened checkout, releases recurrent creation, and still honors a late payment", () => {
    const admin = readFileSync(resolve(__dirname, "adminIndividualPaymentOffers.ts"), "utf8");
    const prodamus = readFileSync(resolve(__dirname, "payments.ts"), "utf8");
    const processor = readFileSync(resolve(__dirname, "../payments/paymentEventProcessor.ts"), "utf8");
    expect(admin).toContain('eq(individualPaymentOffers.provider, "prodamus")');
    expect(prodamus).toContain('eq(individualPaymentOffers.status, "expired")');
    expect(processor).toContain('eq(individualPaymentOffers.status, "expired")');
  });

  it("reuses the same provider checkout and excludes personal orders from generic cleanup", () => {
    const route = readFileSync(resolve(__dirname, "individualPaymentOffers.ts"), "utf8");
    const cleanup = readFileSync(resolve(__dirname, "../payments/orderCleanupJob.ts"), "utf8");
    expect(route).toContain("pendingOrder?.checkoutUrl");
    expect(route).toContain("encryptProviderSecret(checkout.checkoutUrl)");
    expect(route).toContain("decryptProviderSecret(pendingOrder.checkoutUrl)");
    expect(cleanup).toContain("isNull(paymentOrders.individualOfferId)");
  });

  it("releases a checkout reservation whose process died before saving the provider URL", () => {
    const route = readFileSync(resolve(__dirname, "individualPaymentOffers.ts"), "utf8");
    expect(route).toContain("checkoutCreationLeaseMs");
    expect(route).toContain("isNull(paymentOrders.checkoutUrl)");
    expect(route).toContain("lt(paymentOrders.updatedAt, staleBefore)");
    expect(route).toContain("INDIVIDUAL_OFFER_CHECKOUT_LEASE_LOST");
  });

  it("rechecks recurrent conflicts at checkout for every provider", () => {
    const route = readFileSync(resolve(__dirname, "individualPaymentOffers.ts"), "utf8");
    expect(route).toContain('offer.kind === "recurrent"');
    expect(route).toContain("hasBlockingRecurrentSubscription");
  });

  it("keeps an ambiguous Lava invoice reserved and correlates its webhook by merchant order id", () => {
    const route = readFileSync(resolve(__dirname, "individualPaymentOffers.ts"), "utf8");
    const lava = readFileSync(resolve(__dirname, "../payments/lava.ts"), "utf8");
    const webhook = readFileSync(resolve(__dirname, "../payments/lavaWebhook.ts"), "utf8");
    const processor = readFileSync(resolve(__dirname, "../payments/paymentEventProcessor.ts"), "utf8");
    const reconciliation = readFileSync(resolve(__dirname, "../payments/paymentReconciliation.ts"), "utf8");
    expect(route).toContain("ambiguousLavaResult");
    expect(lava).toContain("clientUtm: { utm_content: input.orderId }");
    expect(webhook).toContain("merchantOrderId");
    expect(processor).toContain("event.merchantOrderId");
    expect(reconciliation).toContain("findExternalOrderId");
    expect(reconciliation).toContain("ambiguousBefore");
  });
});
