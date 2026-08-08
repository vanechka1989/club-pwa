import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(__dirname, "../../drizzle/0058_lava_multicurrency.sql");
const periodicityMigrationPath = resolve(__dirname, "../../drizzle/0059_lava_catalog_price_periodicity.sql");
const lifetimeAccessMigrationPath = resolve(__dirname, "../../drizzle/0070_lifetime_payment_access.sql");

describe("Lava payment schema migration", () => {
  it("adds multicurrency price tables and backfills immutable order snapshots", () => {
    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("payment_provider_catalog_item_prices");
    expect(sql).toContain("payment_product_provider_prices");
    expect(sql).toContain('SET "currency" = \'RUB\', "amount_minor" = "amount_rub" * 100');
    expect(sql).toContain("payment_orders_amount_minor_positive");
  });

  it("rekeys Lava catalog prices by currency and billing period", () => {
    expect(existsSync(periodicityMigrationPath)).toBe(true);
    const sql = readFileSync(periodicityMigrationPath, "utf8");
    expect(sql).toContain('DROP INDEX "payment_provider_catalog_item_prices_catalog_item_currency_idx"');
    expect(sql).toContain('"catalog_item_id", "currency", "periodicity"');
  });

  it("stores lifetime access explicitly and keeps immutable order snapshots", () => {
    expect(existsSync(lifetimeAccessMigrationPath)).toBe(true);
    const sql = readFileSync(lifetimeAccessMigrationPath, "utf8");
    expect(sql).toContain('CREATE TYPE "payment_access_type" AS ENUM (\'limited\', \'lifetime\')');
    expect(sql).toContain('ADD COLUMN "access_type_snapshot" "payment_access_type"');
    expect(sql).toContain('ALTER COLUMN "access_days" DROP NOT NULL');
    expect(sql).toContain('"access_type" = \'lifetime\' AND "kind" = \'one_time\' AND "access_days" IS NULL');
  });
});
