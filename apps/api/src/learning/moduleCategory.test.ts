import { describe, expect, it } from "vitest";
import {
  decodeModuleCategoryDefaultCardLayout,
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

  it("stores default lesson card layout without showing it in the description", () => {
    const encoded = encodeModuleCategoryDescription("Первый блок", "horizontal");

    expect(decodeModuleCategoryDescription(encoded)).toBe("Первый блок");
    expect(decodeModuleCategoryDefaultCardLayout(encoded)).toBe("horizontal");
  });
});
