import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(__dirname, "../../drizzle/0054_lava_payment_provider.sql");

describe("Lava payment schema migration", () => {
  it("adds provider-neutral tables without removing legacy columns", () => {
    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("payment_product_provider_bindings");
    expect(sql).toContain("payment_provider_catalog_items");
    expect(sql).toContain("external_subscription_id");
    expect(sql).toContain('INSERT INTO "payment_product_provider_bindings"');
    expect(sql).not.toContain("DROP COLUMN");
  });
});
