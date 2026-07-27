import { describe, expect, it } from "vitest";
import { formatAdminClientLastLogin, getAdminClientContact } from "./adminClientList";

describe("admin client list presentation", () => {
  it("prefers email and falls back to a normalized username", () => {
    expect(getAdminClientContact({ email: "client@example.com", username: "client" })).toBe("client@example.com");
    expect(getAdminClientContact({ email: null, username: "client" })).toBe("@client");
    expect(getAdminClientContact({ email: null, username: "@client" })).toBe("@client");
    expect(getAdminClientContact({ email: null, username: null })).toBeNull();
  });

  it("shows a safe fallback when the last login is missing or invalid", () => {
    const formatter = (value: string) => `formatted:${value}`;
    expect(formatAdminClientLastLogin("2026-07-27T18:00:00.000Z", formatter)).toBe("formatted:2026-07-27T18:00:00.000Z");
    expect(formatAdminClientLastLogin(null, formatter)).toBe("Ещё не входил");
    expect(formatAdminClientLastLogin("invalid", formatter)).toBe("Ещё не входил");
  });
});
