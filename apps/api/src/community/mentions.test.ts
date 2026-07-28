import { describe, expect, it } from "vitest";
import { validateMentionRanges } from "./mentions";

const userId = "9340cc29-622f-4c97-9f55-066b963118a3";

describe("validateMentionRanges", () => {
  it("accepts ranges that exactly cover the named mention", () => {
    expect(
      validateMentionRanges("Привет, @Анна", [
        { userId, displayName: "Анна", start: 8, end: 13 }
      ])
    ).toEqual([{ userId, start: 8, end: 13 }]);
  });

  it("rejects out-of-range and empty spans", () => {
    expect(() =>
      validateMentionRanges("Привет, @Анна", [
        { userId, displayName: "Анна", start: 8, end: 14 }
      ])
    ).toThrow();
    expect(() =>
      validateMentionRanges("Привет, @Анна", [
        { userId, displayName: "Анна", start: 8, end: 8 }
      ])
    ).toThrow();
  });

  it("rejects spans that do not match the named mention", () => {
    expect(() =>
      validateMentionRanges("Привет, @Анна", [
        { userId, displayName: "Мария", start: 8, end: 13 }
      ])
    ).toThrow();
  });

  it("rejects overlapping spans", () => {
    expect(() =>
      validateMentionRanges("@Анна", [
        { userId, displayName: "Анна", start: 0, end: 5 },
        {
          userId: "25475c7d-8ccc-41ca-ae59-a7cd9dd70904",
          displayName: "Анна",
          start: 0,
          end: 5
        }
      ])
    ).toThrow();
  });
});
