import { describe, expect, it } from "vitest";
import { getWriteRateLimitPolicy } from "./writeRateLimitPolicy";

describe("product write rate limiting policy", () => {
  it("limits mutating community and support requests per authenticated user", () => {
    expect(getWriteRateLimitPolicy("GET", "/community/topics/a/messages")).toBeNull();
    expect(getWriteRateLimitPolicy("POST", "/community/topics/a/messages")).toEqual({ scope: "community", limit: 60, windowMs: 60_000 });
    expect(getWriteRateLimitPolicy("POST", "/support/tickets/a/messages")).toEqual({ scope: "support", limit: 30, windowMs: 60_000 });
    expect(getWriteRateLimitPolicy("PUT", "/support/uploads/token")).toEqual({ scope: "support", limit: 30, windowMs: 60_000 });
    expect(getWriteRateLimitPolicy("POST", "/learning/items/a/homework/uploads")).toEqual({ scope: "learning", limit: 20, windowMs: 60_000 });
  });
});
