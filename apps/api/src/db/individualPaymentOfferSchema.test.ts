import { readFileSync } from "node:fs";
import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import migrationJournal from "../../drizzle/meta/_journal.json";
import { individualPaymentOffers, paymentOrders, userRecurrentSubscriptions } from "./schema";

const migration = readFileSync(new URL("../../drizzle/0063_individual_payment_offers.sql", import.meta.url), "utf8");

describe("individual payment offer persistence", () => {
  it("exposes immutable offer and order snapshot columns to Drizzle", () => {
    const offerColumns = getTableColumns(individualPaymentOffers);
    const orderColumns = getTableColumns(paymentOrders);
    const recurrentColumns = getTableColumns(userRecurrentSubscriptions);

    expect(Object.keys(offerColumns)).toEqual(expect.arrayContaining([
      "userId", "createdByUserId", "providerId", "provider", "kind", "title", "currency", "amountMinor",
      "accessDays", "externalProductId", "externalOfferId", "catalogSnapshot", "tokenHash", "status", "expiresAt"
    ]));
    expect(orderColumns.productId.notNull).toBe(false);
    expect(Object.keys(orderColumns)).toEqual(expect.arrayContaining([
      "individualOfferId", "productTitleSnapshot", "productKindSnapshot", "accessDaysSnapshot"
    ]));
    expect(recurrentColumns.productId.notNull).toBe(false);
    expect(recurrentColumns.individualOfferId.notNull).toBe(false);
  });

  it("enforces token secrecy and one pending or paid order per offer in PostgreSQL", () => {
    expect(migration).toContain('CONSTRAINT "individual_payment_offers_token_hash_unique" UNIQUE("token_hash")');
    expect(migration).toContain('CHECK ("status" IN (\'active\', \'checkout_pending\', \'paid\', \'expired\', \'cancelled\'))');
    expect(migration).toContain('CREATE UNIQUE INDEX "payment_orders_offer_pending_unique"');
    expect(migration).toContain('WHERE "status" = \'pending\'');
    expect(migration).toContain('CREATE UNIQUE INDEX "payment_orders_offer_paid_unique"');
    expect(migration).toContain('WHERE "status" = \'paid\'');
  });

  it("registers migration 0063", () => {
    expect(migrationJournal.entries.at(-1)).toMatchObject({ idx: 63, tag: "0063_individual_payment_offers" });
  });
});
