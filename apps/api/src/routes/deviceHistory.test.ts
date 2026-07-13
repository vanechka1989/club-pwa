import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("client device history", () => {
  it("stores every installation and refreshes its last-seen timestamp", () => {
    const meSource = readFileSync(resolve(__dirname, "me.ts"), "utf8");
    const schemaSource = readFileSync(resolve(__dirname, "../db/schema.ts"), "utf8");

    expect(schemaSource).toContain('export const userDevices = pgTable(');
    expect(schemaSource).toContain('"user_devices"');
    expect(schemaSource).toContain('uniqueIndex("user_devices_user_installation_idx")');
    expect(meSource).toContain("insert(userDevices)");
    expect(meSource).toContain("target: [userDevices.userId, userDevices.installationId]");
    expect(meSource).toContain("diagnostics: body.data");
    expect(meSource).toContain("lastSeenAt: now");
  });

  it("returns the complete device history in the admin client detail", () => {
    const adminSource = readFileSync(resolve(__dirname, "admin.ts"), "utf8");

    expect(adminSource).toContain("db.query.userDevices.findMany");
    expect(adminSource).toContain("const devices = userDeviceHistory.flatMap");
    expect(adminSource).toMatch(/device,\s*devices,/);
  });
});
