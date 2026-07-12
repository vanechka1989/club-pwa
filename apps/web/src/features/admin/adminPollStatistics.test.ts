import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const source = readFileSync(resolve(__dirname, "AdminPollStatistics.vue"), "utf8");
describe("admin poll statistics", () => {
  it("shows poll KPIs, participation, anonymity, and option distributions", () => {
    expect(source).toContain("stats.activePolls");
    expect(source).toContain("stats.participationPercent");
    expect(source).toContain("poll.isAnonymous");
    expect(source).toContain("option.percent");
  });
});
