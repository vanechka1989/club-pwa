import { describe, expect, it } from "vitest";
import { formatMembershipStatus } from "./i18n";

describe("membership status labels", () => {
  it("shows only open or closed access states to users", () => {
    expect(formatMembershipStatus("active")).toBe("Доступ открыт");
    expect(formatMembershipStatus("inactive")).toBe("Доступ закрыт");
    expect(formatMembershipStatus("expired")).toBe("Доступ закрыт");
  });

  it("supports English labels", () => {
    expect(formatMembershipStatus("active", "en")).toBe("Access open");
    expect(formatMembershipStatus("inactive", "en")).toBe("Access closed");
    expect(formatMembershipStatus("expired", "en")).toBe("Access closed");
  });
});
