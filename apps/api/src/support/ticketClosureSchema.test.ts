import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const schemaSource = readFileSync(resolve(__dirname, "../db/schema.ts"), "utf8");
const sharedSource = readFileSync(resolve(__dirname, "../../../../packages/shared/src/index.ts"), "utf8");
const migrationPath = resolve(__dirname, "../../drizzle/0044_support_ticket_closure.sql");

describe("support ticket closure metadata", () => {
  it("stores when and by whom a ticket was closed", () => {
    expect(schemaSource).toContain('closedAt: timestamp("closed_at"');
    expect(schemaSource).toContain('closedByUserId: uuid("closed_by_user_id")');
    expect(schemaSource).toContain("closedSupportTickets");
    expect(schemaSource).toContain("closedBy: one(users");
  });

  it("exposes closure metadata through the shared contract", () => {
    expect(sharedSource).toContain("closedAt: z.string().datetime().nullable()");
    expect(sharedSource).toContain("closedBy: z.object({");
  });

  it("adds the closure columns through a migration", () => {
    expect(existsSync(migrationPath)).toBe(true);
    const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
    expect(migration).toContain('ADD COLUMN "closed_at"');
    expect(migration).toContain('ADD COLUMN "closed_by_user_id"');
  });
});
