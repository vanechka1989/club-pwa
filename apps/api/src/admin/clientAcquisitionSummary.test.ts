import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(resolve(__dirname, "../routes/admin.ts"), "utf8");

describe("admin client acquisition summary", () => {
  it("loads the last registration touch for all visible clients in one query", () => {
    expect(routeSource).toContain("userAcquisitionAttributions");
    expect(routeSource).toContain("acquisitionLinks");
    expect(routeSource).toContain("getClientAcquisitionSummaries");
    expect(routeSource).toContain(".innerJoin(acquisitionLinks, eq(userAcquisitionAttributions.lastLinkId, acquisitionLinks.id))");
    expect(routeSource).toContain("acquisition: resolvedAcquisitionByUserId.get(user.id) ?? null");
  });
});
