import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

async function loadRoles() {
  process.env.DATABASE_URL = "postgres://club:club@localhost:5432/club";
  process.env.OWNER_EMAIL = "owner@example.com";
  return import("./roles");
}

describe("admin role permissions", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("fails closed when persisted permissions are malformed", async () => {
    const { normalizeAdminPermissions } = await loadRoles();

    expect(normalizeAdminPermissions(null)).toEqual([]);
    expect(normalizeAdminPermissions("admins")).toEqual([]);
    expect(normalizeAdminPermissions({ permissions: ["admins"] })).toEqual([]);
  });

  it("keeps only known unique permissions from arrays", async () => {
    const { normalizeAdminPermissions } = await loadRoles();

    expect(normalizeAdminPermissions(["admins", "unknown", "admins", "support"])).toEqual(["admins", "support"]);
  });

  it("does not grant hidden administrator access from environment email lists", () => {
    const source = readFileSync(resolve(__dirname, "roles.ts"), "utf8");

    expect(source).not.toContain("ADMIN_EMAILS");
    expect(source).not.toContain("parseAdminIds");
  });
});
