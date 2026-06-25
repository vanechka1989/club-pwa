import { describe, expect, it } from "vitest";
import { formatMembershipStatus } from "./i18n";

describe("membership status labels", () => {
  it("shows only open or closed access states to users", () => {
    expect(formatMembershipStatus("active")).toBe("Доступ открыт");
    expect(formatMembershipStatus("inactive")).toBe("Доступ закрыт");
    expect(formatMembershipStatus("expired")).toBe("Доступ закрыт");
  });
});
