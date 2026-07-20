import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import migrationJournal from "../../drizzle/meta/_journal.json";
import { getMailingEventKey } from "./trackingEvents";

describe("mailing tracking event persistence", () => {
  it("uses stable unique event keys", () => {
    const destination = "https://example.com/report";
    expect(getMailingEventKey("open")).toBe("open");
    expect(getMailingEventKey("push")).toBe("open");
    expect(getMailingEventKey("click", destination)).toBe(
      `click:${createHash("sha256").update(destination).digest("hex")}`,
    );
  });

  it("registers the analytics migration and schema", () => {
    const migration = readFileSync(resolve(__dirname, "../../drizzle/0050_mailing_engagement_analytics.sql"), "utf8");
    const schema = readFileSync(resolve(__dirname, "../db/schema.ts"), "utf8");
    const writer = readFileSync(resolve(__dirname, "./trackingEvents.ts"), "utf8");

    expect(migrationJournal.entries.find((entry) => entry.tag === "0050_mailing_engagement_analytics")).toMatchObject({ idx: 50, version: "7" });
    expect(migration).toContain('ADD COLUMN "analytics_enabled_at"');
    expect(migration).toContain('CREATE TABLE "admin_mailing_events"');
    expect(migration).toContain('admin_mailing_events_recipient_key_idx');
    expect(migration).toContain('admin_mailing_events_mailing_type_time_idx');
    expect(schema).toContain('analyticsEnabledAt: timestamp("analytics_enabled_at"');
    expect(schema).toContain('export const adminMailingEvents = pgTable(');
    expect(writer).toContain("onConflictDoNothing");
    expect(writer).not.toMatch(/user-agent|userAgent|ipAddress|cookie/i);
  });
});
