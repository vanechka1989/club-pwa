import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const schema = readFileSync(resolve(process.cwd(), "src/db/schema.ts"), "utf8");
const routes = readFileSync(resolve(process.cwd(), "src/routes/payments.ts"), "utf8");
const shared = readFileSync(resolve(process.cwd(), "../../packages/shared/src/index.ts"), "utf8");
const migrationPath = resolve(process.cwd(), "drizzle/0037_payment_product_badge.sql");
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

describe("optional payment product badge", () => {
  it("persists and returns a nullable badge label", () => {
    expect(schema).toContain('badgeLabel: varchar("badge_label", { length: 32 })');
    expect(routes).toContain("badgeLabel: z.string().trim().max(32).nullable().optional()");
    expect(routes).toContain("badgeLabel: product.badgeLabel");
    expect(shared).toContain("badgeLabel: z.string().nullable()");
    expect(migration).toContain('ADD COLUMN "badge_label" varchar(32)');
  });
});
