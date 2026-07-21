import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("admin acquisition routes", () => {
  it("protects dashboard, links, and client acquisition with statistics permission", () => {
    const route = readFileSync(resolve(process.cwd(), "src/routes/admin.ts"), "utf8");
    expect(route).toContain('.use("/acquisition", requireAdminPermission("statistics"))');
    expect(route).toContain('.get("/acquisition/dashboard"');
    expect(route).toContain('.get("/acquisition/links"');
    expect(route).toContain('.post("/acquisition/links"');
    expect(route).toContain('.patch("/acquisition/links/:id"');
    expect(route).toContain('.get("/users/:telegramId/acquisition"');
    expect(route).toContain('action: "acquisition.link.created"');
    expect(route).toContain('action: "acquisition.link.status_changed"');
  });
});
