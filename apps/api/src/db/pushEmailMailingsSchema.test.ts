import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("push and email mailings migration", () => {
  it("adds independent delivery channels and email preferences", () => {
    const sql = readFileSync(new URL("../../drizzle/0040_push_email_mailings.sql", import.meta.url), "utf8");
    expect(sql).toContain('ADD COLUMN "marketing_email_opt_out_at"');
    expect(sql).toContain('ADD COLUMN "delivery_count"');
    expect(sql).toContain('ADD COLUMN "channel"');
    expect(sql).toContain('admin_mailing_recipients_mailing_user_channel_idx');
    expect(sql).toContain("IN ('app', 'bot', 'all')");
  });
});
