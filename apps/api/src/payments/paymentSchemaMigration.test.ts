import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(__dirname, "../../drizzle/0058_lava_multicurrency.sql");

describe("Lava payment schema migration", () => {
  it("adds multicurrency price tables and backfills immutable order snapshots", () => {
    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("payment_provider_catalog_item_prices");
    expect(sql).toContain("payment_product_provider_prices");
    expect(sql).toContain('SET "currency" = \'RUB\', "amount_minor" = "amount_rub" * 100');
    expect(sql).toContain("payment_orders_amount_minor_positive");
  });
});
