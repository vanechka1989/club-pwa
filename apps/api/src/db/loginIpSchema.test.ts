import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("login IP persistence schema", () => {
  it("stores unique IPs per user and the session's last IP", () => {
    const source = readFileSync(resolve(__dirname, "schema.ts"), "utf8");

    expect(source).toContain('export const userLoginIps = pgTable(');
    expect(source).toContain('"user_login_ips"');
    expect(source).toContain('lastIpAddress: varchar("last_ip_address", { length: 45 })');
    expect(source).toMatch(/uniqueIndex\("user_login_ips_user_ip_idx"\)\.on\(table\.userId, table\.ipAddress\)/);
    expect(source).toMatch(/index\("user_login_ips_user_last_seen_idx"\)\.on\(table\.userId, table\.lastSeenAt\)/);
  });
});
