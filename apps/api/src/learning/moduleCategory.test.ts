import { describe, expect, it } from "vitest";
import {
  decodeModuleCategoryDescription,
  encodeModuleCategoryDescription,
  isModuleCategoryDescription
} from "./moduleCategory";

describe("module category description helpers", () => {
  it("marks learning categories that belong to the modules section", () => {
    const encoded = encodeModuleCategoryDescription("Первый блок");

    expect(isModuleCategoryDescription(encoded)).toBe(true);
    expect(decodeModuleCategoryDescription(encoded)).toBe("Первый блок");
  });

  it("keeps old unmarked categories outside the modules section", () => {
    expect(isModuleCategoryDescription("Старая категория")).toBe(false);
    expect(decodeModuleCategoryDescription("Старая категория")).toBe("Старая категория");
  });

  it("supports modules without a visible description", () => {
    expect(decodeModuleCategoryDescription(encodeModuleCategoryDescription(""))).toBeNull();
  });
});
