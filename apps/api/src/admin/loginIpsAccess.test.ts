import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("admin login IP access", () => {
  it("protects the dedicated endpoint with only the login_ips permission", () => {
    const source = readFileSync(resolve(__dirname, "../routes/admin.ts"), "utf8");
    expect(source).toContain('.use("/login-ips/*", requireAdminPermission("login_ips"))');
    expect(source).toContain('.get("/login-ips/:telegramId", async (c) =>');
    expect(source).toContain("db.query.userLoginIps.findMany");
    expect(source).toContain('c.header("Cache-Control", "no-store")');
  });
});
