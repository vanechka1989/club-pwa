import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("outbound email accounting migration", () => {
  it("stores all SMTP attempts for the rolling daily counter", () => {
    const sql = readFileSync(new URL("../../drizzle/0046_email_delivery_log.sql", import.meta.url), "utf8");
    expect(sql).toContain('CREATE TABLE "email_delivery_log"');
    expect(sql).toContain('"recipient_count" integer');
    expect(sql).toContain('"category" varchar(32)');
    expect(sql).toContain('email_delivery_log_status_created_idx');
  });
});
