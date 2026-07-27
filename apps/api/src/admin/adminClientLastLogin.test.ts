import { describe, expect, it } from "vitest";
import { serializeAdminLastLoginAt } from "./adminClientLastLogin";

describe("admin client last login", () => {
  it("serializes the latest session and keeps a never-login client null", () => {
    expect(serializeAdminLastLoginAt(new Date("2026-07-27T18:00:00.000Z"))).toBe("2026-07-27T18:00:00.000Z");
    expect(serializeAdminLastLoginAt(null)).toBeNull();
    expect(serializeAdminLastLoginAt(undefined)).toBeNull();
  });
});
