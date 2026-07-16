import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "../routes/support.ts"), "utf8");

describe("support ticket close route", () => {
  it("records the first closer and serializes closure metadata", () => {
    expect(source).toContain("closedAt: now");
    expect(source).toContain("closedByUserId: userId");
    expect(source).toContain("closedAt: dateToIso(ticket.closedAt)");
    expect(source).toContain("closedBy: ticket.closedBy");
    expect(source).toContain("closedBy: true");
    expect(source).toMatch(/ne\(supportTickets\.status, "closed"\)/);
  });
});
