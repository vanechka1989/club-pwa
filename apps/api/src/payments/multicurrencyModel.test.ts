import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "../db/schema";

type RelationHelpers = {
  one: () => { withFieldName: (name: string) => string };
  many: () => { withFieldName: (name: string) => string };
};

describe("multicurrency payment database model", () => {
  it("defines an immutable currency and minor-unit snapshot for each order", () => {
    const orders = schema.paymentOrders as unknown as Record<string, { name?: string }>;

    expect(orders.currency?.name).toBe("currency");
    expect(orders.amountMinor?.name).toBe("amount_minor");
  });

  it("models dynamic catalog prices by currency", () => {
    const catalogPrices = (schema as Record<string, unknown>).paymentProviderCatalogItemPrices as Record<string, { name?: string }> | undefined;

    expect(catalogPrices?.catalogItemId?.name).toBe("catalog_item_id");
    expect(catalogPrices?.currency?.name).toBe("currency");
    expect(catalogPrices?.amountMinor?.name).toBe("amount_minor");
    expect(catalogPrices?.periodicity?.name).toBe("periodicity");
  });

  it("allows the same catalog currency across different billing periods", () => {
    const config = getTableConfig(schema.paymentProviderCatalogItemPrices);
    const priceIndex = config.indexes.find((index) =>
      index.config.name === "payment_provider_catalog_item_prices_catalog_item_currency_periodicity_idx"
    );

    expect(priceIndex?.config.unique).toBe(true);
    expect(priceIndex?.config.columns.map((column) => "name" in column ? column.name : null)).toEqual([
      "catalog_item_id",
      "currency",
      "periodicity"
    ]);
  });

  it("models enabled binding prices by currency", () => {
    const bindingPrices = (schema as Record<string, unknown>).paymentProductProviderPrices as Record<string, { name?: string }> | undefined;

    expect(bindingPrices?.bindingId?.name).toBe("binding_id");
    expect(bindingPrices?.currency?.name).toBe("currency");
    expect(bindingPrices?.amountMinor?.name).toBe("amount_minor");
    expect(bindingPrices?.isEnabled?.name).toBe("is_enabled");
  });

  it("relates prices through their binding rather than unrelated provider or product tables", () => {
    const helpers: RelationHelpers = {
      one: () => ({ withFieldName: (name: string) => name }),
      many: () => ({ withFieldName: (name: string) => name })
    };
    const providerRelations = schema.paymentProvidersRelations as unknown as { config: (helpers: RelationHelpers) => Record<string, unknown> };
    const productRelations = schema.paymentProductsRelations as unknown as { config: (helpers: RelationHelpers) => Record<string, unknown> };

    expect(providerRelations.config(helpers)).not.toHaveProperty("productProviderPrices");
    expect(providerRelations.config(helpers)).not.toHaveProperty("catalogItemPrices");
    expect(productRelations.config(helpers)).not.toHaveProperty("providerPrices");
  });
});
