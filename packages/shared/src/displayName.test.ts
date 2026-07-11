import { describe, expect, it } from "vitest";
import { isValidDisplayName, normalizeDisplayName, resolveDisplayName } from "./index";

describe("display name", () => {
  it("validates supported unique nickname format", () => {
    expect(normalizeDisplayName("  Иван_89 ")).toBe("Иван_89");
    expect(isValidDisplayName("Иван_89")).toBe(true);
    expect(isValidDisplayName("ab")).toBe(false);
    expect(isValidDisplayName("имя с пробелом")).toBe(false);
  });

  it("prefers the editable display name", () => {
    expect(resolveDisplayName({ displayName: "НовыйНик", firstName: "Иван", username: "old", telegramId: "1" })).toBe("НовыйНик");
  });
});
