import { beforeEach, describe, expect, it, vi } from "vitest";

async function loadRoles() {
  process.env.DATABASE_URL = "postgres://club:club@localhost:5432/club";
  process.env.TELEGRAM_BOT_TOKEN = "123:token";
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
});
