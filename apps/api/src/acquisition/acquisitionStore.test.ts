import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  acquisitionLinks,
  acquisitionVisitors,
  acquisitionVisits,
  userAcquisitionAttributions
} from "../db/schema";

describe("acquisition persistence", () => {
  it("defines all acquisition tables and migration indexes", () => {
    expect(getTableName(acquisitionLinks)).toBe("acquisition_links");
    expect(getTableName(acquisitionVisitors)).toBe("acquisition_visitors");
    expect(getTableName(acquisitionVisits)).toBe("acquisition_visits");
    expect(getTableName(userAcquisitionAttributions)).toBe("user_acquisition_attributions");

    const migration = readFileSync(resolve(process.cwd(), "drizzle/0051_acquisition_analytics.sql"), "utf8");
    expect(migration).toContain('CREATE UNIQUE INDEX "acquisition_links_aid_idx"');
    expect(migration).toContain('CREATE UNIQUE INDEX "acquisition_visitors_hash_idx"');
    expect(migration).toContain('CREATE INDEX "acquisition_visits_link_time_idx"');
    expect(migration).toContain('CREATE UNIQUE INDEX "user_acquisition_attributions_user_idx"');
    expect(readFileSync(resolve(process.cwd(), "drizzle/meta/_journal.json"), "utf8")).toContain("0051_acquisition_analytics");
  });
});
