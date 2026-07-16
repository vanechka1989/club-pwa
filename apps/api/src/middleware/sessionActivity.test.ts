import { describe, expect, it } from "vitest";
import { shouldRefreshSessionActivity } from "./sessionActivity";

describe("shouldRefreshSessionActivity", () => {
  const now = new Date("2026-07-16T12:00:00.000Z");

  it("does not write activity again during the five minute window", () => {
    expect(shouldRefreshSessionActivity(new Date("2026-07-16T11:57:00.000Z"), now)).toBe(false);
  });

  it("refreshes activity once the five minute window has elapsed", () => {
    expect(shouldRefreshSessionActivity(new Date("2026-07-16T11:55:00.000Z"), now)).toBe(true);
  });
});
