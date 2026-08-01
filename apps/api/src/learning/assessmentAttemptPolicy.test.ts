import { describe, expect, it } from "vitest";
import { getQuizAttemptAllowance } from "./assessmentAttemptPolicy";

describe("quiz attempt policy", () => {
  it("grants the configured attempt pack again after each admin reset", () => {
    expect(getQuizAttemptAllowance(3, 0)).toBe(3);
    expect(getQuizAttemptAllowance(3, 1)).toBe(6);
    expect(getQuizAttemptAllowance(2, 3)).toBe(8);
  });

  it("never returns an invalid allowance", () => {
    expect(getQuizAttemptAllowance(0, -1)).toBe(1);
  });
});
